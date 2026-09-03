import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Clock, Send,
  AlertCircle, BadgeCheck, XCircle, Upload, ImageIcon, X,
  ExternalLink, FileText,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Feedback';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Task, TaskSubmission } from '@/types';
import { Zap } from 'lucide-react';

const formatMoney = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [taskImageUrl, setTaskImageUrl] = useState<string | null>(null);
  const [submission, setSubmission] = useState<TaskSubmission | null>(null);
  const [proof, setProof] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [success, setSuccess] = useState(false);

  // Screenshot upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      setLoading(true);
      setLoadError('');
      const { data: t, error: tErr } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle();
      if (tErr) setLoadError('Failed to load task details.');
      const taskData = t as Task | null;
      setTask(taskData);
      if (taskData?.task_image_url) {
        setTaskImageUrl(supabase.storage.from('task-images').getPublicUrl(taskData.task_image_url).data.publicUrl);
      } else {
        setTaskImageUrl(null);
      }
      const { data: s, error: sErr } = await supabase
        .from('task_submissions')
        .select('*')
        .eq('task_id', id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sErr) setLoadError('Failed to load your submission.');
      setSubmission(s as TaskSubmission | null);
      setLoading(false);
    })();
  }, [id, user]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError('Please upload a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('Image must be 10MB or smaller.');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadedPath(null);
  };

  const handleRemoveImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadedPath(null);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadScreenshot = async (): Promise<string | null> => {
    if (!selectedFile || !user) return null;
    const fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

    setUploading(true);
    setUploadError('');

    const { data: upData, error: upErr } = await supabase.storage
      .from('task-proofs')
      .upload(fileName, selectedFile, {
        contentType: selectedFile.type,
        cacheControl: '3600',
      });

    setUploading(false);

    if (upErr) {
      setUploadError(`Upload failed: ${upErr.message}`);
      return null;
    }

    setUploadedPath(fileName);
    return fileName;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user) return;
    if (proof.trim().length < 10) {
      setError('Please provide detailed proof (at least 10 characters).');
      return;
    }

    setError('');
    setSubmitting(true);

    let imagePath: string | null = null;
    if (selectedFile && !uploadedPath) {
      imagePath = await uploadScreenshot();
      if (selectedFile && !imagePath) {
        setSubmitting(false);
        return;
      }
    } else if (uploadedPath) {
      imagePath = uploadedPath;
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc('submit_task_safe', {
      p_task_id: id,
      p_proof_text: proof.trim(),
      p_proof_image_url: imagePath,
    });

    setSubmitting(false);

    if (rpcErr) {
      const msg = rpcErr.message || '';
      if (msg.includes('already been approved')) {
        setError('Your submission for this task has already been approved.');
      } else if (msg.includes('pending submission')) {
        setError('You have a pending submission for this task. Please wait for review.');
      } else if (msg.includes('too many') || msg.includes('limit')) {
        setError('You are submitting tasks too quickly. Please wait a while before trying again.');
      } else if (msg.includes('suspended')) {
        setError('Your account is suspended. Please contact support if you believe this is an error.');
      } else if (msg.includes('flagged') || msg.includes('review')) {
        setError('Your account is under review. Please contact support to resolve this.');
      } else if (msg.includes('not currently accepting') || msg.includes('maximum')) {
        setError('This task is no longer accepting submissions.');
      } else if (msg.includes('too many rejections') || msg.includes('excessive')) {
        setError('You have had too many rejections on this task. Please contact support.');
      } else {
        setError(msg);
      }
      return;
    }

    const newId = rpcData as string;
    const { data: subData } = await supabase
      .from('task_submissions')
      .select('*')
      .eq('id', newId)
      .maybeSingle();
    setSubmission(subData as TaskSubmission);
    setSuccess(true);
    handleRemoveImage();
    setProof('');
  };

  if (loading) return <Spinner size="lg" className="py-20" />;

  if (loadError && !task) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="mx-auto h-12 w-12 text-ink-400" />
        <p className="mt-4 font-semibold text-ink-50">{loadError}</p>
        <Button to="/dashboard/tasks" variant="secondary" size="sm" className="mt-4">Back to tasks</Button>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="mx-auto h-12 w-12 text-ink-400" />
        <p className="mt-4 font-semibold text-ink-50">Task not found</p>
        <Button to="/dashboard/tasks" variant="secondary" size="sm" className="mt-4">Back to tasks</Button>
      </div>
    );
  }

  const isFull = task.approved_count >= task.max_completions;
  const canResubmit = submission?.status === 'rejected' && task.status === 'active' && !isFull && !profile?.is_suspended;
  const canSubmit = (!submission || canResubmit) && task.status === 'active' && !isFull && !profile?.is_suspended;
  const showSubmissionCard = submission && (submission.status !== 'rejected' || !success);
  const isDisabled = submitting || uploading;
  const validTaskLink = task.task_link && /^https?:\/\//.test(task.task_link) ? task.task_link : null;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <button onClick={() => navigate('/dashboard/tasks')} className="flex items-center gap-1 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to tasks
      </button>

      <Card className="p-6">
        {taskImageUrl && (
          <img
            src={taskImageUrl}
            alt={task.title}
            className="mb-4 w-full max-h-64 rounded-xl object-cover"
          />
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge tone="brand" className="capitalize mb-2">{task.category}</Badge>
            <h1 className="text-2xl font-bold text-white">{task.title}</h1>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-accent-400">{formatMoney(task.reward)}</p>
            <p className="text-xs text-ink-400">reward</p>
          </div>
        </div>
        <p className="mt-4 text-ink-400">{task.description}</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { icon: BadgeCheck, label: 'Verification', value: task.verification_type, capitalize: true },
            { icon: FileText, label: 'Status', value: task.status, capitalize: true },
            { icon: Clock, label: 'Type', value: task.category, capitalize: true },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-ink-800/50 p-3">
              <item.icon className="h-4 w-4 text-ink-400" />
              <p className="mt-1.5 text-xs text-ink-400">{item.label}</p>
              <p className={`text-sm font-semibold text-white ${item.capitalize ? 'capitalize' : ''}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Slot info */}
        <div className="mt-4 rounded-xl bg-ink-800/30 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-400">Completions</span>
            <span className="font-semibold text-white">{task.approved_count} / {task.max_completions} approved</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-ink-400">Slots remaining</span>
            <span className={`font-semibold ${isFull ? 'text-danger-400' : 'text-accent-400'}`}>{Math.max(0, task.max_completions - task.approved_count)}</span>
          </div>
        </div>

        {validTaskLink && (
          <a
            href={validTaskLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <ExternalLink className="h-4 w-4" />
            Open Task Link
          </a>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-bold text-white">Instructions</h2>
        <div className="mt-3 whitespace-pre-wrap text-sm text-ink-400">
          {task.instructions || 'Follow the task description and submit your proof below.'}
        </div>
      </Card>

      {showSubmissionCard ? (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">Your Submission</h2>
            <StatusBadge status={submission!.status} />
          </div>
          <div className="mt-4 rounded-xl bg-ink-800/50 p-4">
            <p className="text-xs font-medium text-ink-400">Your Proof</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-50">{submission!.proof_text}</p>
          </div>
          {submission!.proof_image_url && (
            <div className="mt-3 rounded-xl bg-ink-800/50 p-4">
              <p className="text-xs font-medium text-ink-400">Screenshot</p>
              <ProofImage path={submission!.proof_image_url} />
            </div>
          )}
          {submission!.status === 'rejected' && submission!.rejection_reason && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-danger-500/10 p-4">
              <XCircle className="h-5 w-5 shrink-0 text-danger-400" />
              <div>
                <p className="text-sm font-semibold text-danger-400">Rejected: {submission!.rejection_reason}</p>
                {submission!.is_auto_verified && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
                    <Zap className="h-3 w-3" /> Automatically verified
                  </p>
                )}
                <p className="mt-1 text-xs text-ink-400">You can submit a new proof below.</p>
              </div>
            </div>
          )}
          {submission!.status === 'approved' && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent-400/10 p-4">
              <BadgeCheck className="h-5 w-5 text-accent-400" />
              <div>
                <p className="text-sm font-semibold text-accent-400">
                  Approved! {formatMoney(submission!.reward_amount)} credited to your wallet.
                </p>
                {submission!.is_auto_verified && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
                    <Zap className="h-3 w-3" /> Automatically verified
                  </p>
                )}
              </div>
            </div>
          )}
          {submission!.status === 'pending' && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-warning-500/10 p-4">
              <Clock className="h-5 w-5 text-warning-400" />
              <p className="text-sm font-semibold text-warning-400">
                Under review — our team will verify your submission shortly.
              </p>
            </div>
          )}
        </Card>
      ) : null}

      {canSubmit ? (
        <Card className="p-6">
          <h2 className="font-bold text-white">Submit Proof</h2>
          <p className="mt-1 text-sm text-ink-400">
            {task.verification_type === 'automatic'
              ? 'Submit your proof below. The system will automatically verify your submission and credit your reward if valid.'
              : 'Provide detailed proof of task completion. Our admin team will review it.'}
          </p>
          {success && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent-400/10 p-3">
              <CheckCircle2 className="h-4 w-4 text-accent-400" />
              <span className="text-sm font-medium text-accent-400">Proof submitted successfully!</span>
            </div>
          )}
          {canResubmit && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-600/10 p-3">
              <AlertCircle className="h-4 w-4 text-brand-400" />
              <span className="text-sm font-medium text-brand-400">Your previous submission was rejected. Submit a new proof below.</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <Textarea
              label="Proof of Completion"
              name="proof"
              placeholder="Describe what you did, include links, or any details that verify you completed the task..."
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              rows={6}
              required
            />

            {/* Screenshot upload */}
            <div>
              <label className="label">Screenshot Proof</label>
              <p className="mb-2 text-xs text-ink-400">Supported: PNG, JPG, JPEG, WebP. Maximum size: 10MB.</p>

              {previewUrl ? (
                <div className="rounded-xl border border-ink-200 p-4">
                  <div className="relative inline-block">
                    <img
                      src={previewUrl}
                      alt="Screenshot preview"
                      className="max-h-64 rounded-xl border border-ink-200 object-contain"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute -right-2 -top-2 rounded-full bg-danger-500 p-1.5 text-white shadow-lg transition hover:bg-danger-600"
                      aria-label="Remove screenshot"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <div className="text-ink-400">
                      <p className="font-medium text-ink-50">{selectedFile?.name}</p>
                      <p>{selectedFile ? formatFileSize(selectedFile.size) : ''}</p>
                    </div>
                    {uploadedPath && (
                      <span className="flex items-center gap-1.5 text-accent-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
                      </span>
                    )}
                  </div>
                  {!uploadedPath && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isDisabled}
                      className="mt-2 text-xs text-brand-400 hover:text-brand-300 disabled:opacity-50"
                    >
                      Replace image
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isDisabled}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 px-4 py-8 text-ink-400 transition hover:border-brand-600/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? (
                    <><Spinner size="sm" /> <span className="text-sm">Uploading...</span></>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Upload className="h-5 w-5" />
                        <ImageIcon className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-medium">Upload Screenshot</span>
                      <span className="text-xs">PNG, JPG, JPEG, WebP — max 10MB</span>
                    </>
                  )}
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isDisabled}
              />

              {uploadError && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-danger-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {uploadError}
                </p>
              )}
            </div>

            {error && <div className="rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}
            <Button type="submit" disabled={isDisabled}>
              {submitting ? <Spinner size="sm" /> : <><Send className="h-4 w-4" /> Submit Proof</>}
            </Button>
          </form>
        </Card>
      ) : !showSubmissionCard ? (
        <Card className="p-6 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-ink-400" />
          <p className="mt-3 font-semibold text-ink-50">
            {task.status === 'paused' ? 'This task is currently paused.' : 'This task is no longer accepting submissions.'}
          </p>
          <Button to="/dashboard/tasks" variant="secondary" size="sm" className="mt-4">Browse other tasks</Button>
        </Card>
      ) : null}
    </div>
  );
}

function ProofImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked = false;
    (async () => {
      const { data, error } = await supabase.storage.from('task-proofs').createSignedUrl(path, 3600);
      if (revoked) return;
      if (error || !data?.signedUrl) {
        setError(true);
        setLoading(false);
        return;
      }
      setUrl(data.signedUrl);
      setLoading(false);
    })();
    return () => { revoked = true; };
  }, [path]);

  if (loading) return <div className="mt-2"><Spinner size="sm" /></div>;
  if (error || !url) return <p className="mt-2 text-xs text-ink-400">Image unavailable</p>;
  return (
    <img
      src={url}
      alt="Proof screenshot"
      className="mt-2 max-h-64 rounded-xl border border-ink-200 object-contain"
    />
  );
}
