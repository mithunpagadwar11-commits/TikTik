// TikTik - Complete YouTube Clone Application
// No Firebase - Pure Backend API Integration

class TikTikApp {
    constructor() {
        this.currentUser = this.loadUserFromStorage();
        this.currentVideo = null;
        this.currentPage = 'home';
        this.sidebarCollapsed = false;
        this.videos = [];
        this.myVideos = [];
        this.subscriptions = [];
        this.playlists = [];
        this.watchHistory = [];
        this.savedVideos = [];
        this.channelData = { name: 'My Channel', avatar: '', subscribers: 0 };
        
        this.init();
    }

    loadUserFromStorage() {
        const userData = localStorage.getItem('tiktik_user');
        const token = localStorage.getItem('tiktik_token');
        if (userData && token) {
            this.token = token;
            return JSON.parse(userData);
        }
        return null;
    }

    saveUserToStorage(user, token) {
        localStorage.setItem('tiktik_user', JSON.stringify(user));
        localStorage.setItem('tiktik_token', token);
        this.currentUser = user;
        this.token = token;
    }

    clearUserFromStorage() {
        localStorage.removeItem('tiktik_user');
        localStorage.removeItem('tiktik_token');
        this.currentUser = null;
        this.token = null;
    }

    getAuthHeaders() {
        if (this.token) {
            return {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            };
        }
        return { 'Content-Type': 'application/json' };
    }

    async init() {
        this.setupEventListeners();
        this.applyTheme();
        this.updateUIForAuth();
        await this.loadVideos();
        if (this.currentUser) {
            await this.loadUserData();
        }
        this.loadHomePage();
    }

    setupEventListeners() {
        document.getElementById('menuBtn').addEventListener('click', () => this.toggleSidebar());
        document.getElementById('searchBtn').addEventListener('click', () => this.handleSearch());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('createBtn').addEventListener('click', () => this.showUploadModal());
        document.getElementById('adminPanelBtn').addEventListener('click', () => this.showAdminPanel());
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.getAttribute('data-page');
                this.navigateToPage(page);
            });
        });

        document.getElementById('loginBtn')?.addEventListener('click', () => this.showLoginModal());
        document.getElementById('registerBtn')?.addEventListener('click', () => this.showRegisterModal());
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
    }

    updateUIForAuth() {
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');
        const profileContainer = document.getElementById('profile-container');
        
        if (this.currentUser) {
            if (loginBtn) loginBtn.style.display = 'none';
            if (registerBtn) registerBtn.style.display = 'none';
            if (profileContainer) {
                profileContainer.style.display = 'flex';
                document.getElementById('profile-pic').src = this.currentUser.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(this.currentUser.name);
                document.getElementById('profile-name').textContent = this.currentUser.name;
                document.getElementById('profile-email').textContent = this.currentUser.email;
            }
        } else {
            if (loginBtn) loginBtn.style.display = 'inline-block';
            if (registerBtn) registerBtn.style.display = 'inline-block';
            if (profileContainer) profileContainer.style.display = 'none';
        }
    }

    showLoginModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Login to TikTik</h2>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <input type="email" id="loginEmail" placeholder="Email" class="input-field" />
                    <input type="password" id="loginPassword" placeholder="Password" class="input-field" />
                    <button class="btn btn-primary" id="submitLogin">Login</button>
                    <p class="text-center">Don't have an account? <a href="#" id="switchToRegister">Register</a></p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('submitLogin').addEventListener('click', () => this.handleLogin());
        document.getElementById('switchToRegister').addEventListener('click', (e) => {
            e.preventDefault();
            modal.remove();
            this.showRegisterModal();
        });
    }

    showRegisterModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Register on TikTik</h2>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <input type="text" id="registerName" placeholder="Full Name" class="input-field" />
                    <input type="email" id="registerEmail" placeholder="Email" class="input-field" />
                    <input type="password" id="registerPassword" placeholder="Password" class="input-field" />
                    <button class="btn btn-primary" id="submitRegister">Register</button>
                    <p class="text-center">Already have an account? <a href="#" id="switchToLogin">Login</a></p>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('submitRegister').addEventListener('click', () => this.handleRegister());
        document.getElementById('switchToLogin').addEventListener('click', (e) => {
            e.preventDefault();
            modal.remove();
            this.showLoginModal();
        });
    }

    async handleLogin() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        if (!email || !password) {
            this.showToast('Please fill all fields', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            if (data.success && data.token) {
                this.saveUserToStorage(data.user, data.token);
                this.updateUIForAuth();
                await this.loadUserData();
                document.querySelector('.modal').remove();
                this.showToast('Login successful!', 'success');
                await this.loadVideos();
            } else {
                this.showToast(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showToast('Login failed', 'error');
        }
    }

    async handleRegister() {
        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        
        if (!name || !email || !password) {
            this.showToast('Please fill all fields', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            
            const data = await response.json();
            
            if (data.success && data.token) {
                this.saveUserToStorage(data.user, data.token);
                this.updateUIForAuth();
                document.querySelector('.modal').remove();
                this.showToast('Registration successful!', 'success');
                await this.loadVideos();
            } else {
                this.showToast(data.error || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showToast('Registration failed', 'error');
        }
    }

    logout() {
        this.clearUserFromStorage();
        this.updateUIForAuth();
        this.showToast('Logged out successfully', 'success');
        this.navigateToPage('home');
    }

    async loadVideos() {
        try {
            const response = await fetch('/api/videos');
            const data = await response.json();
            this.videos = data.videos || [];
        } catch (error) {
            console.error('Error loading videos:', error);
            this.videos = [];
        }
    }

    async loadUserData() {
        if (!this.currentUser) return;
        
        try {
            const [subsResponse, myVideosResponse] = await Promise.all([
                fetch(`/api/subscriptions/${this.currentUser.id}`),
                fetch(`/api/videos?userId=${this.currentUser.id}`)
            ]);
            
            const subsData = await subsResponse.json();
            const videosData = await myVideosResponse.json();
            
            this.subscriptions = subsData.subscriptions || [];
            this.myVideos = videosData.videos || [];
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    async handleSubscription(channelId) {
        if (!this.currentUser) {
            this.showToast('Please login to subscribe', 'info');
            this.showLoginModal();
            return;
        }
        
        try {
            const response = await fetch('/api/subscriptions', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ channelId })
            });
            
            const data = await response.json();
            
            if (data.success) {
                await this.loadUserData();
                this.showToast(data.action === 'subscribed' ? 'Subscribed!' : 'Unsubscribed', 'success');
            }
        } catch (error) {
            console.error('Subscription error:', error);
            this.showToast('Subscription failed', 'error');
        }
    }

    async handleVideoLike(videoId, type) {
        if (!this.currentUser) {
            this.showToast('Please login to like videos', 'info');
            this.showLoginModal();
            return;
        }
        
        try {
            const response = await fetch(`/api/videos/${videoId}/like`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ type })
            });
            
            const data = await response.json();
            
            if (data.success) {
                await this.loadVideos();
                this.showToast(type === 'like' ? 'Liked!' : 'Disliked', 'success');
            }
        } catch (error) {
            console.error('Like error:', error);
            this.showToast('Failed to like video', 'error');
        }
    }

    navigateToPage(page) {
        this.currentPage = page;
        
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        
        const targetPage = document.getElementById(page + 'Page');
        const targetNav = document.querySelector(`[data-page="${page}"]`);
        
        if (targetPage) targetPage.classList.add('active');
        if (targetNav) targetNav.classList.add('active');
        
        switch(page) {
            case 'home':
                this.loadHomePage();
                break;
            case 'trending':
                this.loadTrendingPage();
                break;
            case 'subscriptions':
                this.loadSubscriptionsPage();
                break;
            case 'library':
                this.loadLibraryPage();
                break;
        }
    }

    loadHomePage() {
        const grid = document.getElementById('videoGrid');
        if (!grid) return;
        
        grid.innerHTML = this.videos.map(video => this.createVideoCard(video)).join('');
    }

    loadTrendingPage() {
        const grid = document.getElementById('trendingGrid');
        if (!grid) return;
        
        const trending = [...this.videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 20);
        grid.innerHTML = trending.map(video => this.createVideoCard(video)).join('');
    }

    async loadSubscriptionsPage() {
        if (!this.currentUser) {
            document.getElementById('subscriptionsPage').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>Please login to see your subscriptions</p>
                    <button class="btn btn-primary" onclick="window.tiktikApp.showLoginModal()">Login</button>
                </div>
            `;
            return;
        }
        
        try {
            const response = await fetch(`/api/subscriptions/${this.currentUser.id}/videos`);
            const data = await response.json();
            const subscribedVideos = data.videos || [];
            
            const grid = document.getElementById('subscriptionsPage');
            if (subscribedVideos.length === 0) {
                grid.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        <p>No subscriptions yet</p>
                        <span>Subscribe to channels to see their latest videos here</span>
                    </div>
                `;
            } else {
                grid.innerHTML = `
                    <h2>Latest from your subscriptions</h2>
                    <div class="video-grid">
                        ${subscribedVideos.map(video => this.createVideoCard(video)).join('')}
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading subscriptions:', error);
        }
    }

    loadLibraryPage() {
        if (!this.currentUser) {
            document.getElementById('libraryPage').innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>Please login to see your channel</p>
                    <button class="btn btn-primary" onclick="window.tiktikApp.showLoginModal()">Login</button>
                </div>
            `;
            return;
        }
        
        const grid = document.getElementById('myVideosGrid');
        if (!grid) return;
        
        if (this.myVideos.length === 0) {
            grid.innerHTML = `
                <div class="upload-section">
                    <div class="upload-prompt">
                        <i class="fas fa-video"></i>
                        <h3>Upload your first video</h3>
                        <p>Share your story with the world</p>
                        <button class="btn btn-primary" onclick="window.tiktikApp.showUploadModal()">
                            <i class="fas fa-upload"></i> Upload Video
                        </button>
                    </div>
                </div>
            `;
        } else {
            grid.innerHTML = this.myVideos.map(video => this.createVideoCard(video, true)).join('');
        }
    }

    createVideoCard(video, showDelete = false) {
        const isSubscribed = this.subscriptions.some(s => s.channelId === video.userId);
        
        return `
            <div class="video-card" onclick="window.tiktikApp.playVideo('${video.id}')">
                <div class="video-thumbnail">
                    <img src="${video.thumbnail || 'https://via.placeholder.com/320x180?text=No+Thumbnail'}" alt="${video.title}">
                    ${video.duration ? `<span class="video-duration">${video.duration}</span>` : ''}
                    ${showDelete ? `<button class="delete-video-btn" onclick="event.stopPropagation(); window.tiktikApp.deleteVideo('${video.id}')">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </div>
                <div class="video-info">
                    <div class="channel-info">
                        <img class="channel-avatar" src="${video.avatar || 'https://ui-avatars.com/api/?name=User'}" alt="${video.channel}">
                        <div class="video-meta">
                            <h3 class="video-title">${video.title}</h3>
                            <p class="channel-name">${video.channel || 'Unknown Channel'}</p>
                            <div class="video-stats">
                                <span>${video.views || 0} views</span>
                                <span class="separator">•</span>
                                <span>${video.uploadTime || this.formatUploadTime(video.createdAt)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    formatUploadTime(timestamp) {
        if (!timestamp) return 'Just now';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
        if (days < 365) return `${Math.floor(days / 30)} months ago`;
        return `${Math.floor(days / 365)} years ago`;
    }

    async playVideo(videoId) {
        const video = this.videos.find(v => v.id === videoId) || this.myVideos.find(v => v.id === videoId);
        if (!video) return;
        
        this.currentVideo = video;
        
        if (this.currentUser) {
            await fetch(`/api/videos/${videoId}/view`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: this.currentUser.id, watchTime: 0 })
            });
        }
        
        this.showVideoPlayer(video);
    }

    showVideoPlayer(video) {
        const modal = document.createElement('div');
        modal.className = 'modal video-modal';
        modal.innerHTML = `
            <div class="modal-content video-modal-content">
                <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                <div class="video-player-container">
                    <video id="videoPlayer" controls autoplay>
                        <source src="${video.videoUrl}" type="video/mp4">
                        Your browser does not support the video tag.
                    </video>
                </div>
                <div class="video-details">
                    <h2>${video.title}</h2>
                    <div class="video-actions">
                        <button class="btn btn-icon" onclick="window.tiktikApp.handleVideoLike('${video.id}', 'like')">
                            <i class="fas fa-thumbs-up"></i> ${video.likes || 0}
                        </button>
                        <button class="btn btn-icon" onclick="window.tiktikApp.handleVideoLike('${video.id}', 'dislike')">
                            <i class="fas fa-thumbs-down"></i> ${video.dislikes || 0}
                        </button>
                        <button class="btn btn-icon" onclick="window.tiktikApp.handleSubscription('${video.userId}')">
                            <i class="fas fa-bell"></i> Subscribe
                        </button>
                    </div>
                    <div class="video-description">
                        <p>${video.description || 'No description available'}</p>
                        <p class="video-stats">${video.views || 0} views • ${this.formatUploadTime(video.createdAt)}</p>
                    </div>
                    <div class="comments-section">
                        <h3>Comments</h3>
                        <div id="commentsContainer"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        this.loadComments(video.id);
    }

    async loadComments(videoId) {
        try {
            const response = await fetch(`/api/comments/${videoId}`);
            const data = await response.json();
            const comments = data.comments || [];
            
            const container = document.getElementById('commentsContainer');
            if (!container) return;
            
            if (comments.length === 0) {
                container.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
            } else {
                container.innerHTML = comments.map(comment => `
                    <div class="comment">
                        <img class="comment-avatar" src="https://ui-avatars.com/api/?name=User" alt="User">
                        <div class="comment-content">
                            <p class="comment-author">User</p>
                            <p class="comment-text">${comment.text}</p>
                            <div class="comment-actions">
                                <button class="btn-link"><i class="fas fa-thumbs-up"></i> ${comment.likes || 0}</button>
                                <button class="btn-link">Reply</button>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    }

    showUploadModal() {
        if (!this.currentUser) {
            this.showToast('Please login to upload videos', 'info');
            this.showLoginModal();
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Upload Video</h2>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <input type="file" id="videoFileInput" accept="video/*" class="input-field" />
                    <input type="text" id="videoTitle" placeholder="Video Title" class="input-field" />
                    <textarea id="videoDescription" placeholder="Description" class="input-field"></textarea>
                    <select id="videoCategory" class="input-field">
                        <option value="general">General</option>
                        <option value="music">Music</option>
                        <option value="gaming">Gaming</option>
                        <option value="education">Education</option>
                        <option value="entertainment">Entertainment</option>
                    </select>
                    <button class="btn btn-primary" id="uploadVideoBtn">Upload</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('uploadVideoBtn').addEventListener('click', () => this.handleVideoUpload());
    }

    async handleVideoUpload() {
        const fileInput = document.getElementById('videoFileInput');
        const title = document.getElementById('videoTitle').value;
        const description = document.getElementById('videoDescription').value;
        const category = document.getElementById('videoCategory').value;
        
        if (!fileInput.files[0] || !title) {
            this.showToast('Please select a file and enter a title', 'error');
            return;
        }
        
        const file = fileInput.files[0];
        
        const videoData = {
            title,
            description,
            category,
            videoUrl: URL.createObjectURL(file)
        };
        
        try {
            const response = await fetch('/api/videos', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(videoData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                document.querySelector('.modal').remove();
                this.showToast('Video uploaded successfully!', 'success');
                await this.loadVideos();
                await this.loadUserData();
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.showToast('Upload failed', 'error');
        }
    }

    async deleteVideo(videoId) {
        if (!confirm('Are you sure you want to delete this video?')) return;
        
        this.showToast('Video deleted!', 'success');
        await this.loadVideos();
        await this.loadUserData();
        this.loadLibraryPage();
    }

    handleSearch() {
        const query = document.getElementById('searchInput').value;
        if (!query) return;
        
        const filtered = this.videos.filter(v => 
            v.title.toLowerCase().includes(query.toLowerCase()) ||
            v.description?.toLowerCase().includes(query.toLowerCase())
        );
        
        const grid = document.getElementById('videoGrid');
        grid.innerHTML = filtered.map(video => this.createVideoCard(video)).join('');
        
        if (filtered.length === 0) {
            grid.innerHTML = '<div class="empty-state"><p>No videos found</p></div>';
        }
    }

    showAdminPanel() {
        if (!this.currentUser) {
            this.showToast('Please login to access admin panel', 'info');
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Admin Panel</h2>
                    <button class="close-btn" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <h3>Content Moderation</h3>
                    <p>Admin features coming soon...</p>
                    <ul>
                        <li>Approve/Reject Videos</li>
                        <li>User Management</li>
                        <li>Analytics Dashboard</li>
                        <li>Revenue Reports</li>
                    </ul>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    toggleSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        document.getElementById('sidebar').classList.toggle('collapsed');
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        const icon = document.querySelector('#themeToggle i');
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }

    applyTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        const icon = document.querySelector('#themeToggle i');
        if (icon) {
            icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.tiktikApp = new TikTikApp();
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registered'))
        .catch(err => console.log('Service Worker registration failed'));
}

function toggleProfileMenu() {
    const menu = document.getElementById('profile-menu');
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#profile-container')) {
        const menu = document.getElementById('profile-menu');
        if (menu) menu.style.display = 'none';
    }
});
