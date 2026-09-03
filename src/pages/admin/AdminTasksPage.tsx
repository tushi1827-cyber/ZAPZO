import { useEffect, useRef, useState } from 'react';
import { Plus, ClipboardList, Pencil, Pause, Play, Archive, Trash2, Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { AdminPageWrapper } from '@/components/AdminLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Task, TaskCategory, TaskStatus, VerificationType, AutoVerificationType } from '@/types';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const categories: TaskCategory[] = ['social', 'survey', 'website', 'app', 'learning', 'other'];
const statuses: TaskStatus[] = ['draft', 'active', 'paused', 'completed', 'expired'];

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const emptyForm = {
  title: '', description: '', instructions: '', category: 'social' as TaskCategory,
  reward: '50', max_completions: '100', verification_type: 'manual' as VerificationType,
  status: 'active' as TaskStatus, start_date: '', end_date: '', task_link: '',
  auto_verification_type: '' as AutoVerificationType | '',
  auto_verification_target_url: '',
  auto_verification_keywords: '',
};

export function AdminTasksPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');

  // Task image upload state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [removedExistingImage, setRemovedExistingImage] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
    if (error) setListError('Failed to load tasks.');
    else setListError('');
    setTasks((data as Task[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadTasks(); }, []);

  const resetImageState = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setUploadingImage(false);
    setImageError('');
    setExistingImageUrl(null);
    setRemovedExistingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    resetImageState();
    setModalOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description,
      instructions: task.instructions,
      category: task.category,
      reward: String(task.reward),
      max_completions: String(task.max_completions),
      verification_type: task.verification_type,
      status: task.status,
      start_date: task.start_date ? new Date(task.start_date).toISOString().slice(0, 10) : '',
      end_date: task.end_date ? new Date(task.end_date).toISOString().slice(0, 10) : '',
      task_link: task.task_link || '',
      auto_verification_type: (task.auto_verification_type || '') as AutoVerificationType | '',
      auto_verification_target_url: task.auto_verification_config?.target_url || '',
      auto_verification_keywords: (task.auto_verification_config?.keywords || []).join(', '),
    });
    setError('');
    resetImageState();
    if (task.task_image_url) {
      setExistingImageUrl(supabase.storage.from('task-images').getPublicUrl(task.task_image_url).data.publicUrl);
    }
    setModalOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setImageError('Please upload a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError('Image must be 5MB or smaller.');
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
    setRemovedExistingImage(true);
  };

  const handleRemoveImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setSelectedImage(null);
    setImagePreview(null);
    setImageError('');
    setExistingImageUrl(null);
    setRemovedExistingImage(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadTaskImage = async (taskId: string): Promise<string | null> => {
    if (!selectedImage) return null;
    const fileExt = selectedImage.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
    setUploadingImage(true);
    const { error: upErr } = await supabase.storage.from('task-images').upload(fileName, selectedImage, {
      contentType: selectedImage.type,
      cacheControl: '3600',
    });
    setUploadingImage(false);
    if (upErr) {
      setImageError('Failed to upload image. Please try again.');
      return null;
    }
    return fileName;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.title.trim().length < 3) {
      setError('Title must be at least 3 characters.');
      return;
    }
    if (form.description.trim().length < 3) {
      setError('Description is required.');
      return;
    }
    if (form.instructions.trim().length < 3) {
      setError('Instructions are required.');
      return;
    }
    const reward = parseFloat(form.reward);
    const maxC = parseInt(form.max_completions);
    if (isNaN(reward) || reward <= 0) { setError('Reward must be greater than 0.'); return; }
    if (isNaN(maxC) || maxC < 1) { setError('Max completions must be at least 1.'); return; }

    // Date validation: end date cannot be before start date
    if (form.start_date && form.end_date) {
      const start = new Date(form.start_date);
      const end = new Date(form.end_date);
      if (end < start) {
        setError('End date cannot be earlier than start date.');
        return;
      }
    }

    // Auto verification config validation
    let autoVerType: string | null = null;
    let autoVerConfig: Record<string, unknown> | null = null;
    if (form.verification_type === 'automatic') {
      if (!form.auto_verification_type) {
        setError('Please select an automatic verification method.');
        return;
      }
      autoVerType = form.auto_verification_type;
      if (form.auto_verification_type === 'link_click') {
        if (!form.auto_verification_target_url.trim()) {
          setError('Please provide a target URL for link-click verification.');
          return;
        }
        try {
          const url = new URL(form.auto_verification_target_url.trim());
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            setError('Target URL must be http:// or https://');
            return;
          }
        } catch {
          setError('Target URL must be a valid http:// or https:// URL.');
          return;
        }
        autoVerConfig = { type: 'link_click', target_url: form.auto_verification_target_url.trim() };
      } else if (form.auto_verification_type === 'keyword_check') {
        const keywords = form.auto_verification_keywords
          .split(',').map(k => k.trim()).filter(k => k.length > 0);
        if (keywords.length === 0) {
          setError('Please provide at least one keyword for keyword verification.');
          return;
        }
        autoVerConfig = { type: 'keyword_check', keywords };
      }
    }

    let taskLink: string | null = null;
    if (form.task_link.trim()) {
      try {
        const url = new URL(form.task_link.trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          setError('Task link must be a valid http:// or https:// URL.');
          return;
        }
        taskLink = form.task_link.trim();
      } catch {
        setError('Task link must be a valid http:// or https:// URL.');
        return;
      }
    }

    setSaving(true);

    const basePayload = {
      title: form.title.trim(),
      description: form.description.trim(),
      instructions: form.instructions.trim(),
      category: form.category,
      reward,
      max_completions: maxC,
      verification_type: form.verification_type,
      status: form.status,
      start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      task_link: taskLink,
      auto_verification_type: autoVerType,
      auto_verification_config: autoVerConfig,
      created_by: user?.id,
    };

    let taskId: string = editing?.id || '';

    if (editing) {
      // Handle image: upload new, or clear existing
      let imageFieldValue: string | null = editing.task_image_url;
      if (selectedImage) {
        const newPath = await uploadTaskImage(editing.id);
        if (newPath) {
          imageFieldValue = newPath;
          // Delete old image if it existed
          if (editing.task_image_url) {
            await supabase.storage.from('task-images').remove([editing.task_image_url]);
          }
        } else {
          setSaving(false);
          return;
        }
      } else if (removedExistingImage) {
        if (editing.task_image_url) {
          await supabase.storage.from('task-images').remove([editing.task_image_url]);
        }
        imageFieldValue = null;
      }

      const { error: updErr } = await supabase
        .from('tasks')
        .update({ ...basePayload, task_image_url: imageFieldValue })
        .eq('id', editing.id);
      setSaving(false);
      if (updErr) {
        setError(updErr.message);
        return;
      }
    } else {
      // Insert first without image, then upload and update
      const { data: inserted, error: insErr } = await supabase
        .from('tasks')
        .insert({ ...basePayload, task_image_url: null })
        .select('id')
        .single();
      setSaving(false);
      if (insErr || !inserted) {
        setError(insErr?.message || 'Failed to create task.');
        return;
      }
      taskId = inserted.id;

      if (selectedImage) {
        const newPath = await uploadTaskImage(taskId);
        if (newPath) {
          await supabase.from('tasks').update({ task_image_url: newPath }).eq('id', taskId);
        }
      }
    }

    setModalOpen(false);
    resetImageState();
    await loadTasks();
  };

  const changeStatus = async (task: Task, status: TaskStatus) => {
    if (rowActionId) return;
    setRowActionId(task.id);
    const { error } = await supabase.from('tasks').update({ status }).eq('id', task.id);
    setRowActionId(null);
    if (error) { setListError('Failed to update task status.'); return; }
    setListError('');
    await loadTasks();
  };

  const deleteTask = async (task: Task) => {
    if (rowActionId) return;
    if (!confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;
    setRowActionId(task.id);
    if (task.task_image_url) {
      await supabase.storage.from('task-images').remove([task.task_image_url]);
    }
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    setRowActionId(null);
    if (error) { setListError('Failed to delete task.'); return; }
    setListError('');
    await loadTasks();
  };

  if (loading) return <Spinner size="lg" className="py-20" />;

  const currentImagePreview = imagePreview || (!removedExistingImage ? existingImageUrl : null);

  return (
    <AdminPageWrapper
      title="Task Management"
      subtitle="Create, edit, and manage reward tasks."
      actions={<Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" /> New Task</Button>}
    >
      {listError && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{listError}</div>}
      <Card className="overflow-hidden">
        {tasks.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title="No tasks yet"
            description="Create your first task to get started."
            action={<Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" /> Create Task</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="px-4 py-3 font-semibold text-ink-400">Title</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden sm:table-cell">Category</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Reward</th>
                  <th className="px-4 py-3 font-semibold text-ink-400 hidden md:table-cell">Progress</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Status</th>
                  <th className="px-4 py-3 font-semibold text-ink-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-b border-ink-200/50 hover:bg-ink-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {task.task_image_url && (
                          <img
                            src={supabase.storage.from('task-images').getPublicUrl(task.task_image_url).data.publicUrl}
                            alt={task.title}
                            className="h-10 w-10 shrink-0 rounded-lg object-cover"
                          />
                        )}
                        <p className="font-medium text-white">{task.title}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge tone="neutral" className="capitalize">{task.category}</Badge>
                    </td>
                    <td className="px-4 py-3 font-bold text-accent-400">{formatMoney(task.reward)}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-ink-400">{task.approved_count}/{task.max_completions}</td>
                    <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(task)} disabled={!!rowActionId} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        {task.status === 'active' ? (
                          <button onClick={() => changeStatus(task, 'paused')} disabled={!!rowActionId} className="rounded-lg p-2 text-warning-400 hover:bg-warning-500/10 disabled:opacity-40 disabled:cursor-not-allowed" title="Pause">
                            {rowActionId === task.id ? <Spinner size="sm" /> : <Pause className="h-4 w-4" />}
                          </button>
                        ) : task.status === 'paused' ? (
                          <button onClick={() => changeStatus(task, 'active')} disabled={!!rowActionId} className="rounded-lg p-2 text-brand-400 hover:bg-brand-600/10 disabled:opacity-40 disabled:cursor-not-allowed" title="Activate">
                            {rowActionId === task.id ? <Spinner size="sm" /> : <Play className="h-4 w-4" />}
                          </button>
                        ) : null}
                        <button onClick={() => changeStatus(task, 'completed')} disabled={!!rowActionId} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed" title="Archive">
                          {rowActionId === task.id ? <Spinner size="sm" /> : <Archive className="h-4 w-4" />}
                        </button>
                        <button onClick={() => deleteTask(task)} disabled={!!rowActionId} className="rounded-lg p-2 text-danger-400 hover:bg-danger-500/10 disabled:opacity-40 disabled:cursor-not-allowed" title="Delete">
                          {rowActionId === task.id ? <Spinner size="sm" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetImageState(); }} title={editing ? 'Edit Task' : 'Create Task'} size="lg">
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="Title" name="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Textarea label="Description" name="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />

          {/* Task Image upload */}
          <div>
            <label className="label">Task Image (optional)</label>
            <p className="mb-2 text-xs text-ink-400">Displayed to users on the task card and detail page. PNG, JPG, WebP — max 5MB.</p>
            {currentImagePreview ? (
              <div className="relative inline-block">
                <img src={currentImagePreview} alt="Task image preview" className="max-h-40 rounded-xl border border-ink-200 object-contain" />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute -right-2 -top-2 rounded-full bg-danger-500 p-1.5 text-white shadow-lg transition hover:bg-danger-600"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
                {uploadingImage && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
                    <Spinner size="sm" /> Uploading...
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving || uploadingImage}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 px-4 py-6 text-ink-400 transition hover:border-brand-600/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="h-5 w-5" />
                <span className="text-sm font-medium">Click to upload task image</span>
                <span className="text-xs">PNG, JPG, WebP — max 5MB</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleImageSelect}
              className="hidden"
              disabled={saving || uploadingImage}
            />
            {imageError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-danger-400">
                <AlertCircle className="h-3.5 w-3.5" />
                {imageError}
              </p>
            )}
          </div>

          {/* Task Link */}
          <Input
            label="Task Link / Target URL (optional)"
            name="task_link"
            type="url"
            placeholder="https://instagram.com/example"
            value={form.task_link}
            onChange={(e) => setForm({ ...form, task_link: e.target.value })}
            hint="Shown to users as an 'Open Task Link' button. Must be http:// or https://."
          />

          <Textarea label="Instructions" name="instructions" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} rows={4} hint="Step-by-step instructions for users." />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" name="category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TaskCategory })}>
              {categories.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </Select>
            <Select label="Status" name="status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
              {statuses.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
            </Select>
            <Input label="Reward (INR)" type="number" step="0.01" name="reward" value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} />
            <Input label="Max Completions" type="number" name="max_completions" value={form.max_completions} onChange={(e) => setForm({ ...form, max_completions: e.target.value })} />
            <Select label="Verification Type" name="verification_type" value={form.verification_type} onChange={(e) => setForm({ ...form, verification_type: e.target.value as VerificationType, auto_verification_type: '' })}>
              <option value="manual">Manual</option>
              <option value="automatic">Automatic</option>
            </Select>
            <div></div>
            <Input label="Start Date (optional)" type="date" name="start_date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            <Input label="End Date (optional)" type="date" name="end_date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>

          {/* Automatic Verification Configuration */}
          {form.verification_type === 'automatic' && (
            <div className="rounded-xl border border-brand-600/30 bg-brand-600/5 p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-white">Automatic Verification Configuration</p>
                <p className="mt-1 text-xs text-ink-400">Configure how submissions are automatically verified when a user submits proof. The system checks the proof text against your rules and approves or rejects instantly.</p>
              </div>
              <Select
                label="Verification Method"
                name="auto_verification_type"
                value={form.auto_verification_type}
                onChange={(e) => setForm({ ...form, auto_verification_type: e.target.value as AutoVerificationType | '' })}
              >
                <option value="">Select a method...</option>
                <option value="link_click">Link Click Verification</option>
                <option value="keyword_check">Keyword Check Verification</option>
              </Select>

              {form.auto_verification_type === 'link_click' && (
                <Input
                  label="Target URL"
                  name="auto_verification_target_url"
                  type="url"
                  placeholder="https://example.com/landing-page"
                  value={form.auto_verification_target_url}
                  onChange={(e) => setForm({ ...form, auto_verification_target_url: e.target.value })}
                  hint="The system checks that the user's proof text contains this URL, confirming they visited the required link."
                />
              )}

              {form.auto_verification_type === 'keyword_check' && (
                <Input
                  label="Keywords (comma-separated)"
                  name="auto_verification_keywords"
                  placeholder="followed, subscribed, completed"
                  value={form.auto_verification_keywords}
                  onChange={(e) => setForm({ ...form, auto_verification_keywords: e.target.value })}
                  hint="The system checks that the user's proof text contains at least one of these keywords. Separate multiple keywords with commas."
                />
              )}
            </div>
          )}
          {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setModalOpen(false); resetImageState(); }}>Cancel</Button>
            <Button type="submit" disabled={saving || uploadingImage}>
              {saving || uploadingImage ? <Spinner size="sm" /> : editing ? 'Save Changes' : 'Create Task'}
            </Button>
          </div>
        </form>
      </Modal>
    </AdminPageWrapper>
  );
}
