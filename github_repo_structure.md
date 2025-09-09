# Trevi Foundations Leave Management System - Complete Repository

## 📁 Repository Structure

```
trevi-leave-management/
├── README.md
├── LICENSE
├── .gitignore
├── .env.example
├── package.json
├── server.js
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── railway.toml
├── Procfile
├── render.yaml
├── frontend/
│   ├── index.html
│   ├── README.md
│   └── netlify.toml
├── migrations/
│   ├── migrate.js
│   └── init.sql
├── seeds/
│   ├── seed.js
│   └── sample-data.sql
├── tests/
│   ├── auth.test.js
│   ├── employees.test.js
│   └── leave-requests.test.js
├── docs/
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── DATABASE.md
├── .github/
│   └── workflows/
│       └── deploy.yml
└── uploads/
    └── .gitkeep
```

## 🚀 Steps to Create Your GitHub Repository

### 1. Create Repository on GitHub
1. Go to [GitHub](https://github.com)
2. Click "New repository"
3. Name it: `trevi-leave-management`
4. Make it Public or Private
5. Don't initialize with README (we'll add our own)
6. Click "Create repository"

### 2. Clone and Setup Locally
```bash
git clone https://github.com/YOUR_USERNAME/trevi-leave-management.git
cd trevi-leave-management
```

### 3. Create the File Structure
Copy each file from the artifacts below into the corresponding location in your repository.

---

## 📄 File Contents

### Root Files

#### README.md
```markdown
# Trevi Foundations Leave Management System

A comprehensive leave management system for Trevi Foundations Nigeria Limited, featuring a modern web frontend and robust Node.js backend API.

## 🌟 Features

- **Role-based Access Control**: Employee, Manager, HR Admin roles
- **Leave Management**: Apply, approve, reject, and track leave requests
- **Real-time Dashboard**: Statistics and analytics
- **Team Calendar**: Visual representation of team leaves
- **File Uploads**: Supporting document handling
- **Email Notifications**: Automated status updates
- **Comprehensive Reports**: HR analytics and insights
- **Mobile Responsive**: Works on all devices

## 🛠 Tech Stack

### Frontend
- HTML5, CSS3 (Tailwind CSS)
- Vanilla JavaScript
- Font Awesome icons
- Responsive design

### Backend
- Node.js 18+
- Express.js
- PostgreSQL 15+
- JWT Authentication
- Multer for file uploads
- bcryptjs for password hashing

## 🚀 Quick Start

### Frontend (Netlify)
1. Navigate to `frontend/` directory
2. Deploy `index.html` to Netlify
3. Update API endpoints in the frontend code

### Backend (Railway/Heroku)
1. Set up PostgreSQL database
2. Configure environment variables
3. Deploy using your preferred platform

## 📚 Documentation

- [API Documentation](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Database Schema](docs/DATABASE.md)

## 🎯 Demo Accounts

- **Employee**: `employee@trevi.com` / `password`
- **Manager**: `manager@trevi.com` / `password`
- **HR Admin**: `hr@trevi.com` / `password`
- **Admin**: `admin@trevi.com` / `admin123`

## 🚀 Live Demo

- **Frontend**: [https://trevi-leave-management.netlify.app](https://your-netlify-url.netlify.app)
- **Backend API**: [https://your-api-domain.com](https://your-railway-url.up.railway.app)

## 📞 Support

For questions or support, contact:
- **Email**: hr@trevi.com
- **Company**: Trevi Foundations Nigeria Limited

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for Trevi Foundations Nigeria Limited**
```

#### .gitignore
```gitignore
# Dependencies
node_modules