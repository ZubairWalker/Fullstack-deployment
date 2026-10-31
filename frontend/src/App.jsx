import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const defaultForm = {
  title: '',
  description: '',
  priority: 'medium',
  dueDate: '',
};

function App() {
  const [todos, setTodos] = useState([]);
  const [form, setForm] = useState(defaultForm);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const apiBase = useMemo(() => {
    return process.env.REACT_APP_API_URL || 'http://localhost:3000/api';
  }, []);

  const fetchTodos = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${apiBase}/todos`);
      setTodos(response.data.todos || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load the todo list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodos();
  }, [apiBase]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const payload = new FormData();
      payload.append('title', form.title);
      payload.append('description', form.description);
      payload.append('priority', form.priority);
      if (form.dueDate) {
        payload.append('dueDate', form.dueDate);
      }
      if (file) {
        payload.append('attachments', file);
      }

      await axios.post(`${apiBase}/todos`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setForm(defaultForm);
      setFile(null);
      await fetchTodos();
    } catch (err) {
      setError(err.response?.data?.error || 'Todo could not be created.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id, completed) => {
    try {
      await axios.put(`${apiBase}/todos/${id}`, { completed: !completed });
      await fetchTodos();
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to update todo.');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${apiBase}/todos/${id}`);
      await fetchTodos();
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to delete todo.');
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Task board</p>
          <h1>Full-stack todo dashboard</h1>
        </div>
        <div className="status-pill">API: {apiBase}</div>
      </header>

      <main className="layout">
        <section className="panel">
          <h2>Add a todo</h2>
          <form onSubmit={handleSubmit} className="todo-form">
            <label>
              Title
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Description
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                rows="4"
              />
            </label>
            <div className="row">
              <label>
                Priority
                <select name="priority" value={form.priority} onChange={handleChange}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label>
                Due date
                <input type="date" name="dueDate" value={form.dueDate} onChange={handleChange} />
              </label>
            </div>
            <label>
              Attachment
              <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            <button disabled={submitting} type="submit">
              {submitting ? 'Saving...' : 'Create todo'}
            </button>
          </form>
        </section>

        <section className="panel list-panel">
          <h2>Todo list</h2>
          {error && <p className="error-banner">{error}</p>}
          {loading ? (
            <p>Loading tasks...</p>
          ) : todos.length === 0 ? (
            <p className="empty-state">No todos yet. Add the first task.</p>
          ) : (
            <ul className="todo-list">
              {todos.map((todo) => (
                <li key={todo._id} className={`todo-item ${todo.completed ? 'done' : ''}`}>
                  <div className="todo-main">
                    <button
                      className="toggle"
                      type="button"
                      onClick={() => handleToggle(todo._id, todo.completed)}
                    >
                      {todo.completed ? 'Completed' : 'Mark done'}
                    </button>
                    <div>
                      <h3>{todo.title}</h3>
                      <p>{todo.description || 'No description'}</p>
                      <div className="meta-row">
                        <span className={`priority ${todo.priority}`}>{todo.priority}</span>
                        {todo.dueDate && <span>Due: {new Date(todo.dueDate).toLocaleDateString()}</span>}
                      </div>
                    </div>
                  </div>

                  {todo.attachments?.length ? (
                    <div className="attachment-list">
                      {todo.attachments.map((attachment) => (
                        <a
                          key={attachment.filename}
                          href={`${apiBase}/uploads/${attachment.filename}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {attachment.originalName || attachment.filename}
                        </a>
                      ))}
                    </div>
                  ) : null}

                  <button className="delete" type="button" onClick={() => handleDelete(todo._id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
