const db = db.getSiblingDB('todoapp');

db.createCollection('todos');

db.todos.createIndex({ createdAt: 1 });
db.todos.createIndex({ completed: 1 });
db.todos.createIndex({ priority: 1 });
db.todos.createIndex({ dueDate: 1 });

db.todos.insertMany([
  {
    title: 'Prepare project kickoff',
    description: 'Review deployment overview and architecture.',
    completed: false,
    priority: 'high',
    dueDate: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: 'Set up environment',
    description: 'Install dependencies and configure Docker services.',
    completed: true,
    priority: 'medium',
    dueDate: new Date(Date.now() + 172800000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: 'Verify monitoring',
    description: 'Check health endpoints and dashboards.',
    completed: false,
    priority: 'low',
    dueDate: new Date(Date.now() + 259200000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]);
