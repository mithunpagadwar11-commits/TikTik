const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { initDatabase } = require('./init-database');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'tiktik-secret-key-change-in-production';

const db = initDatabase();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}
if (!fs.existsSync('uploads/videos')) {
  fs.mkdirSync('uploads/videos');
}
if (!fs.existsSync('uploads/thumbnails')) {
  fs.mkdirSync('uploads/thumbnails');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/videos/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const result = db.prepare(`
      INSERT INTO users (email, password_hash, name, avatar)
      VALUES (?, ?, ?, ?)
    `).run(
      email, 
      passwordHash, 
      name, 
      `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
    );
    
    const user = db.prepare('SELECT id, email, name, avatar FROM users WHERE id = ?').get(result.lastInsertRowid);
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ success: true, user, token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      success: true, 
      user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/videos/upload', authMiddleware, upload.single('video'), (req, res) => {
  try {
    const { title, description, category } = req.body;
    const videoPath = req.file.path;
    const videoUrl = `/uploads/videos/${req.file.filename}`;
    
    const result = db.prepare(`
      INSERT INTO videos (user_id, title, description, category, video_path, video_url, status)
      VALUES (?, ?, ?, ?, ?, ?, 'live')
    `).run(req.userId, title, description, category, videoPath, videoUrl);
    
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(result.lastInsertRowid);
    
    res.json({ success: true, video });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.post('/api/videos', authMiddleware, (req, res) => {
  try {
    const { title, description, category, videoUrl } = req.body;
    
    const result = db.prepare(`
      INSERT INTO videos (user_id, title, description, category, video_url, status)
      VALUES (?, ?, ?, ?, ?, 'live')
    `).run(req.userId, title, description, category, videoUrl);
    
    const video = db.prepare(`
      SELECT v.*, u.name as channel, u.avatar 
      FROM videos v 
      JOIN users u ON v.user_id = u.id 
      WHERE v.id = ?
    `).get(result.lastInsertRowid);
    
    res.json({ success: true, video });
  } catch (error) {
    console.error('Video creation error:', error);
    res.status(500).json({ error: 'Video creation failed' });
  }
});

app.get('/api/videos', (req, res) => {
  try {
    const { userId, category, search } = req.query;
    
    let query = `
      SELECT v.*, u.name as channel, u.avatar,
             (SELECT COUNT(*) FROM likes WHERE video_id = v.id AND type = 'like') as likes,
             (SELECT COUNT(*) FROM likes WHERE video_id = v.id AND type = 'dislike') as dislikes
      FROM videos v
      JOIN users u ON v.user_id = u.id
      WHERE v.status = 'live'
    `;
    
    const params = [];
    
    if (userId) {
      query += ' AND v.user_id = ?';
      params.push(userId);
    }
    
    if (category && category !== 'all') {
      query += ' AND v.category = ?';
      params.push(category);
    }
    
    if (search) {
      query += ' AND (v.title LIKE ? OR v.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    query += ' ORDER BY v.created_at DESC LIMIT 100';
    
    const videos = db.prepare(query).all(...params);
    
    res.json({ videos });
  } catch (error) {
    console.error('Get videos error:', error);
    res.status(500).json({ error: 'Failed to get videos' });
  }
});

app.get('/api/videos/:id', (req, res) => {
  try {
    const video = db.prepare(`
      SELECT v.*, u.name as channel, u.avatar,
             (SELECT COUNT(*) FROM likes WHERE video_id = v.id AND type = 'like') as likes,
             (SELECT COUNT(*) FROM likes WHERE video_id = v.id AND type = 'dislike') as dislikes
      FROM videos v
      JOIN users u ON v.user_id = u.id
      WHERE v.id = ?
    `).get(req.params.id);
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json({ video });
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({ error: 'Failed to get video' });
  }
});

app.post('/api/videos/:id/view', (req, res) => {
  try {
    const { userId, watchTime } = req.body;
    
    db.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').run(req.params.id);
    
    db.prepare(`
      INSERT INTO analytics (video_id, user_id, watch_time)
      VALUES (?, ?, ?)
    `).run(req.params.id, userId || null, watchTime || 0);
    
    res.json({ success: true });
  } catch (error) {
    console.error('View tracking error:', error);
    res.status(500).json({ error: 'Failed to track view' });
  }
});

app.post('/api/videos/:id/like', authMiddleware, (req, res) => {
  try {
    const { type } = req.body;
    
    const existing = db.prepare('SELECT * FROM likes WHERE video_id = ? AND user_id = ?').get(req.params.id, req.userId);
    
    if (existing) {
      if (existing.type === type) {
        db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
        return res.json({ success: true, action: 'removed' });
      } else {
        db.prepare('UPDATE likes SET type = ? WHERE id = ?').run(type, existing.id);
        return res.json({ success: true, action: 'updated' });
      }
    }
    
    db.prepare(`
      INSERT INTO likes (user_id, video_id, type)
      VALUES (?, ?, ?)
    `).run(req.userId, req.params.id, type);
    
    db.prepare(`UPDATE videos SET ${type === 'like' ? 'likes_count' : 'dislikes_count'} = ${type === 'like' ? 'likes_count' : 'dislikes_count'} + 1 WHERE id = ?`).run(req.params.id);
    
    res.json({ success: true, action: 'added' });
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to like video' });
  }
});

app.get('/api/comments/:videoId', (req, res) => {
  try {
    const comments = db.prepare(`
      SELECT c.*, u.name as author, u.avatar
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.video_id = ?
      ORDER BY c.created_at DESC
    `).all(req.params.videoId);
    
    res.json({ comments });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

app.post('/api/comments', authMiddleware, (req, res) => {
  try {
    const { videoId, text, parentId } = req.body;
    
    const result = db.prepare(`
      INSERT INTO comments (video_id, user_id, text, parent_id)
      VALUES (?, ?, ?, ?)
    `).run(videoId, req.userId, text, parentId || null);
    
    const comment = db.prepare(`
      SELECT c.*, u.name as author, u.avatar
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);
    
    res.json({ success: true, comment });
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

app.post('/api/subscriptions', authMiddleware, (req, res) => {
  try {
    const { channelId } = req.body;
    
    const existing = db.prepare('SELECT * FROM subscriptions WHERE follower_id = ? AND channel_id = ?').get(req.userId, channelId);
    
    if (existing) {
      db.prepare('DELETE FROM subscriptions WHERE id = ?').run(existing.id);
      db.prepare('UPDATE users SET subscriber_count = subscriber_count - 1 WHERE id = ?').run(channelId);
      return res.json({ success: true, action: 'unsubscribed' });
    }
    
    db.prepare(`
      INSERT INTO subscriptions (follower_id, channel_id)
      VALUES (?, ?)
    `).run(req.userId, channelId);
    
    db.prepare('UPDATE users SET subscriber_count = subscriber_count + 1 WHERE id = ?').run(channelId);
    
    res.json({ success: true, action: 'subscribed' });
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ error: 'Subscription failed' });
  }
});

app.get('/api/subscriptions/:userId', (req, res) => {
  try {
    const subscriptions = db.prepare(`
      SELECT s.*, u.name as channel_name, u.avatar as channel_avatar
      FROM subscriptions s
      JOIN users u ON s.channel_id = u.id
      WHERE s.follower_id = ?
    `).all(req.params.userId);
    
    res.json({ subscriptions });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    res.status(500).json({ error: 'Failed to get subscriptions' });
  }
});

app.get('/api/subscriptions/:userId/videos', (req, res) => {
  try {
    const videos = db.prepare(`
      SELECT v.*, u.name as channel, u.avatar
      FROM videos v
      JOIN users u ON v.user_id = u.id
      WHERE v.user_id IN (
        SELECT channel_id FROM subscriptions WHERE follower_id = ?
      )
      AND v.status = 'live'
      ORDER BY v.created_at DESC
      LIMIT 50
    `).all(req.params.userId);
    
    res.json({ videos });
  } catch (error) {
    console.error('Get subscription videos error:', error);
    res.status(500).json({ error: 'Failed to get videos' });
  }
});

app.post('/api/playlists', authMiddleware, (req, res) => {
  try {
    const { title, description, privacy } = req.body;
    
    const result = db.prepare(`
      INSERT INTO playlists (user_id, title, description, privacy)
      VALUES (?, ?, ?, ?)
    `).run(req.userId, title, description, privacy || 'public');
    
    const playlist = db.prepare('SELECT * FROM playlists WHERE id = ?').get(result.lastInsertRowid);
    
    res.json({ success: true, playlist });
  } catch (error) {
    console.error('Playlist creation error:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

app.get('/api/playlists/:userId', (req, res) => {
  try {
    const playlists = db.prepare('SELECT * FROM playlists WHERE user_id = ?').all(req.params.userId);
    res.json({ playlists });
  } catch (error) {
    console.error('Get playlists error:', error);
    res.status(500).json({ error: 'Failed to get playlists' });
  }
});

app.get('/api/analytics/:videoId', (req, res) => {
  try {
    const analytics = db.prepare('SELECT * FROM analytics WHERE video_id = ?').all(req.params.videoId);
    
    const totalViews = analytics.length;
    const uniqueViewers = new Set(analytics.filter(a => a.user_id).map(a => a.user_id)).size;
    const totalWatchTime = analytics.reduce((sum, a) => sum + (a.watch_time || 0), 0);
    
    res.json({ totalViews, uniqueViewers, totalWatchTime, events: analytics });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

app.post('/api/watch-later', authMiddleware, (req, res) => {
  try {
    const { videoId } = req.body;
    
    const existing = db.prepare('SELECT * FROM watch_later WHERE user_id = ? AND video_id = ?').get(req.userId, videoId);
    
    if (existing) {
      db.prepare('DELETE FROM watch_later WHERE id = ?').run(existing.id);
      return res.json({ success: true, action: 'removed' });
    }
    
    db.prepare('INSERT INTO watch_later (user_id, video_id) VALUES (?, ?)').run(req.userId, videoId);
    res.json({ success: true, action: 'added' });
  } catch (error) {
    console.error('Watch later error:', error);
    res.status(500).json({ error: 'Failed to update watch later' });
  }
});

app.get('/api/watch-later/:userId', (req, res) => {
  try {
    const videos = db.prepare(`
      SELECT v.*, u.name as channel, u.avatar
      FROM videos v
      JOIN users u ON v.user_id = u.id
      WHERE v.id IN (SELECT video_id FROM watch_later WHERE user_id = ?)
      ORDER BY v.created_at DESC
    `).all(req.params.userId);
    
    res.json({ videos });
  } catch (error) {
    console.error('Get watch later error:', error);
    res.status(500).json({ error: 'Failed to get watch later videos' });
  }
});

app.post('/api/watch-history', (req, res) => {
  try {
    const { userId, videoId, watchTime } = req.body;
    
    if (!userId || !videoId) {
      return res.status(400).json({ error: 'userId and videoId required' });
    }
    
    const existing = db.prepare('SELECT * FROM watch_history WHERE user_id = ? AND video_id = ?').get(userId, videoId);
    
    if (existing) {
      db.prepare('UPDATE watch_history SET watch_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(watchTime, existing.id);
    } else {
      db.prepare('INSERT INTO watch_history (user_id, video_id, watch_time) VALUES (?, ?, ?)').run(userId, videoId, watchTime);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Watch history error:', error);
    res.status(500).json({ error: 'Failed to update watch history' });
  }
});

app.get('/api/watch-history/:userId', (req, res) => {
  try {
    const videos = db.prepare(`
      SELECT v.*, u.name as channel, u.avatar, wh.watch_time, wh.updated_at as last_watched
      FROM videos v
      JOIN users u ON v.user_id = u.id
      JOIN watch_history wh ON v.id = wh.video_id
      WHERE wh.user_id = ?
      ORDER BY wh.updated_at DESC
    `).all(req.params.userId);
    
    res.json({ videos });
  } catch (error) {
    console.error('Get watch history error:', error);
    res.status(500).json({ error: 'Failed to get watch history' });
  }
});

app.post('/api/videos/:videoId/chapters', authMiddleware, (req, res) => {
  try {
    const { title, timestamp } = req.body;
    
    const result = db.prepare(`
      INSERT INTO video_chapters (video_id, title, timestamp)
      VALUES (?, ?, ?)
    `).run(req.params.videoId, title, timestamp);
    
    const chapter = db.prepare('SELECT * FROM video_chapters WHERE id = ?').get(result.lastInsertRowid);
    
    res.json({ success: true, chapter });
  } catch (error) {
    console.error('Chapter creation error:', error);
    res.status(500).json({ error: 'Failed to create chapter' });
  }
});

app.get('/api/videos/:videoId/chapters', (req, res) => {
  try {
    const chapters = db.prepare('SELECT * FROM video_chapters WHERE video_id = ? ORDER BY timestamp ASC').all(req.params.videoId);
    res.json({ chapters });
  } catch (error) {
    console.error('Get chapters error:', error);
    res.status(500).json({ error: 'Failed to get chapters' });
  }
});

app.get('/api/notifications/:userId', (req, res) => {
  try {
    const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.userId);
    res.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

app.post('/api/notifications/:id/read', (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

app.get('/api/admin/videos', authMiddleware, (req, res) => {
  try {
    const videos = db.prepare(`
      SELECT v.*, u.name as channel, u.avatar
      FROM videos v
      JOIN users u ON v.user_id = u.id
      WHERE v.status = 'pending'
      ORDER BY v.created_at DESC
    `).all();
    
    res.json({ videos });
  } catch (error) {
    console.error('Get admin videos error:', error);
    res.status(500).json({ error: 'Failed to get pending videos' });
  }
});

app.post('/api/admin/videos/:id/approve', authMiddleware, (req, res) => {
  try {
    db.prepare('UPDATE videos SET status = ?, published_at = CURRENT_TIMESTAMP WHERE id = ?').run('live', req.params.id);
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
    res.json({ success: true, video });
  } catch (error) {
    console.error('Approve video error:', error);
    res.status(500).json({ error: 'Failed to approve video' });
  }
});

app.post('/api/admin/videos/:id/reject', authMiddleware, (req, res) => {
  try {
    db.prepare('UPDATE videos SET status = ? WHERE id = ?').run('rejected', req.params.id);
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
    res.json({ success: true, video });
  } catch (error) {
    console.error('Reject video error:', error);
    res.status(500).json({ error: 'Failed to reject video' });
  }
});

app.delete('/api/admin/videos/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

app.get('/api/admin/users', authMiddleware, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, email, name, avatar, subscriber_count, created_at,
             (SELECT COUNT(*) FROM videos WHERE user_id = users.id) as video_count
      FROM users
      ORDER BY created_at DESC
    `).all();
    
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

app.get('/api/revenue/:userId', authMiddleware, (req, res) => {
  try {
    const revenue = db.prepare('SELECT * FROM revenue WHERE user_id = ?').all(req.params.userId);
    const totalRevenue = revenue.reduce((sum, r) => sum + r.amount, 0);
    res.json({ revenue, totalRevenue });
  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({ error: 'Failed to get revenue' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log('TikTik Video Platform - Complete YouTube Clone with Database');
  console.log('Database: SQLite (tiktik.db)');
  console.log('Authentication: bcrypt + JWT');
  console.log('File Uploads: Multer + Local Storage');
  console.log('API Endpoints ready - Full CRUD operations with persistence');
});
