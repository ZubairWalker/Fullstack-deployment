const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const redis = require('redis');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');

const envFiles = [path.resolve(__dirname, '../../.env')];
if (process.env.NODE_ENV === 'production') {
  envFiles.push(path.resolve(__dirname, '../../.env.production'));
}

envFiles.forEach((envFile) => {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
  }
});

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
const maxFileSize = Number(process.env.MAX_FILE_SIZE || 5 * 1024 * 1024);
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || (isProduction ? 'mongodb://mongo:27017/todoapp' : 'mongodb://localhost:27017/todoapp');
const redisUrl = process.env.REDIS_URL || (isProduction ? 'redis://redis:6379' : 'redis://localhost:6379');
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain']);

fs.mkdirSync(uploadDir, { recursive: true });

const redisClient = redis.createClient({
  url: redisUrl,
});

let redisConnected = false;
let mongoConnected = false;

redisClient.on('connect', () => {
  redisConnected = true;
  console.log('Redis connected');
});

redisClient.on('error', (error) => {
  redisConnected = false;
  console.error('Redis error:', error.message);
});

mongoose.connection.on('connected', () => {
  mongoConnected = true;
  console.log('MongoDB connected');
});

mongoose.connection.on('error', (error) => {
  mongoConnected = false;
  console.error('MongoDB error:', error.message);
});

const todoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    completed: { type: Boolean, default: false },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    dueDate: { type: Date },
    attachments: [
      {
        filename: String,
        originalName: String,
        mimetype: String,
        size: Number,
        uploadDate: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

const Todo = mongoose.model('Todo', todoSchema);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload rate limit reached. Please slow down.' },
});

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDir),
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname || 'file');
    const safeName = (path.basename(file.originalname || 'file', extension) || 'upload')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .toLowerCase();

    callback(null, `${safeName}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: maxFileSize,
    files: 5,
  },
  fileFilter: (req, file, callback) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new Error('Unsupported file type.'));
  },
});

const clearTodoCache = async (pattern = 'todos:*') => {
  if (!redisConnected) return;

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length) {
      await redisClient.del(keys);
    }
  } catch (error) {
    console.error('Failed to clear Todo cache:', error.message);
  }
};

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost',
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api/', apiLimiter);
app.use('/uploads', express.static(uploadDir));

app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    containerId: process.env.HOSTNAME || 'unknown',
    mongo: mongoConnected,
    redis: redisConnected,
    timestamp: new Date().toISOString(),
  };

  const allConnected = mongoConnected && redisConnected;
  return res.status(allConnected ? 200 : 503).json(health);
});

app.get('/api/todos', async (req, res) => {
  try {
    const { status, priority, page = 1, limit = 10 } = req.query;
    const pageNumber = Number(page) > 0 ? Number(page) : 1;
    const pageSize = Math.min(Number(limit) || 10, 50);
    const filter = {};

    if (status && status !== 'all') {
      filter.completed = status === 'completed';
    }

    if (priority && priority !== 'all') {
      filter.priority = priority;
    }

    const cacheKey = `todos:${status || 'all'}:${priority || 'all'}:${pageNumber}:${pageSize}`;
    if (redisConnected) {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json({ source: 'cache', ...JSON.parse(cached) });
      }
    }

    const total = await Todo.countDocuments(filter);
    const todos = await Todo.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean();

    const payload = {
      todos,
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
      status,
      priority,
    };

    if (redisConnected) {
      await redisClient.setEx(cacheKey, 300, JSON.stringify(payload));
    }

    return res.json(payload);
  } catch (error) {
    console.error('Error fetching todos:', error);
    return res.status(500).json({ error: 'Failed to list todos.' });
  }
});

app.post('/api/todos', uploadLimiter, upload.array('attachments', 5), async (req, res) => {
  try {
    const { title, description, priority, dueDate, completed } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    const attachments = (req.files || []).map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      uploadDate: new Date(),
    }));

    const todo = await Todo.create({
      title: title.trim(),
      description: description || '',
      priority: priority || 'medium',
      dueDate: dueDate ? new Date(dueDate) : undefined,
      completed: completed === 'true' || completed === true,
      attachments,
    });

    await clearTodoCache();
    return res.status(201).json({ message: 'Todo created successfully', todo });
  } catch (error) {
    console.error('Error creating todo:', error);
    return res.status(500).json({ error: 'Failed to create todo.' });
  }
});

app.put('/api/todos/:id', uploadLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };

    if (updates.dueDate) {
      updates.dueDate = new Date(updates.dueDate);
    }

    if (updates.completed !== undefined) {
      updates.completed = Boolean(updates.completed);
    }

    const todo = await Todo.findByIdAndUpdate(id, updates, { new: true });

    if (!todo) {
      return res.status(404).json({ error: 'Todo not found.' });
    }

    await clearTodoCache();
    return res.json({ message: 'Todo updated successfully', todo });
  } catch (error) {
    console.error('Error updating todo:', error);
    return res.status(500).json({ error: 'Failed to update todo.' });
  }
});

app.delete('/api/todos/:id', async (req, res) => {
  try {
    const todo = await Todo.findByIdAndDelete(req.params.id);

    if (!todo) {
      return res.status(404).json({ error: 'Todo not found.' });
    }

    await clearTodoCache();
    return res.json({ message: 'Todo deleted successfully' });
  } catch (error) {
    console.error('Error deleting todo:', error);
    return res.status(500).json({ error: 'Failed to delete todo.' });
  }
});

app.get('/api/analytics', async (req, res) => {
  try {
    const total = await Todo.countDocuments();
    const completed = await Todo.countDocuments({ completed: true });
    const pending = await Todo.countDocuments({ completed: false });
    const byPriority = await Todo.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } },
      { $project: { _id: 0, priority: '$_id', count: 1 } },
    ]);

    return res.json({ total, completed, pending, byPriority });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return res.status(500).json({ error: 'Failed to load analytics.' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }

  if (error && error.message === 'Unsupported file type.') {
    return res.status(400).json({ error: error.message });
  }

  console.error('Unhandled server error:', error);
  return res.status(500).json({ error: 'Internal server error.' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down...`);

  if (redisClient.isOpen) {
    await redisClient.quit();
  }

  await mongoose.disconnect();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function startServer() {
  try {
    await redisClient.connect();
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });

    app.listen(port, '0.0.0.0', () => {
      console.log(`API running on port ${port}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`MongoDB URI: ${mongoUri}`);
      console.log(`Redis URL: ${redisUrl}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

startServer();
