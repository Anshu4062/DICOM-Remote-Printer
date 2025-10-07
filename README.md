# Patient Dashboard v2

A Next.js application for patient medical imaging dashboard with authentication and DICOM file upload capabilities.

## Features

- User registration and login with JWT authentication
- MongoDB database integration
- Secure password hashing with bcrypt
- DICOM image upload functionality
- Responsive dashboard with Tailwind CSS
- Protected routes with middleware

## Prerequisites

- Node.js 18+
- MongoDB (local or cloud)
- npm or yarn

## Setup Instructions

1. **Clone and install dependencies:**

   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env.local` file in the root directory with:

   ```
   MONGODB_URI=mongodb://localhost:27017/patient-dashboard
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   NEXTAUTH_URL=http://localhost:3000
   ```

3. **Start MongoDB:**
   Make sure MongoDB is running on your system. If using MongoDB locally:

   ```bash
   mongod
   ```

4. **Run the development server:**

   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Usage

1. **Register a new account** at `/register`
2. **Login** at `/login`
3. **Access your dashboard** at `/dashboard`
4. **Upload DICOM files** using the upload interface

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   └── register/route.ts
│   │   └── upload/
│   │       └── dicom/route.ts
│   ├── dashboard/
│   │   └── page.tsx
│   ├── login/
│   │   └── page.tsx
│   ├── register/
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   └── mongodb.ts
├── models/
│   └── User.ts
├── .env.local
├── middleware.ts
├── package.json
└── tailwind.config.js
```

## API Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/upload/dicom` - DICOM file upload

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Protected routes with middleware
- File type validation for uploads
- Input validation and sanitization

## Technologies Used

- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Backend:** Next.js API routes
- **Database:** MongoDB with Mongoose
- **Authentication:** JWT tokens
- **File Upload:** FormData API
- **Styling:** Tailwind CSS

## Notes

- DICOM files are stored in the `uploads/{userId}/` directory
- JWT tokens expire after 7 days
- Passwords must be at least 6 characters
- Only `.dcm` and `.dicom` files are accepted for upload
