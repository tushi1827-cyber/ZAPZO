import { useEffect, useState } from 'react';
import { Save, RotateCcw, X, Plus, Trash2, GripVertical, LayoutTemplate } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Feedback';
import { AdminPageWrapper } from '@/components/AdminLayout';
import {
  HomepageContent,
  HomepageFaq,
  HomepageFeature,
  HomepageHowItWorksStep,
  DEFAULT_HOMEPAGE_CONTENT,
  fetchHomepageContent,
  saveHomepageContent,
  resetHomepageContent,
} from '@/lib/homepageContent';

const ICON_OPTIONS = [
  'Rocket', 'Search', 'ClipboardList', 'FileCheck', 'BadgeCheck', 'Coins',
  'Wallet', 'Users', 'ShieldCheck', 'Eye', 'Lock', 'Zap', 'Gift',
  'Share2', 'Fingerprint', 'TrendingUp', 'AlertCircle', 'CheckCircle2',
];

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function AdminHomepageEditorPage() {
  const [content, setContent] = useState<HomepageContent>(DEFAULT_HOMEPAGE_CONTENT);
  const [originalContent, setOriginalContent] = useState<HomepageContent>(DEFAULT_HOMEPAGE_CONTENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    (async () => {
      const data = await fetchHomepageContent();
      setContent(data);
      setOriginalContent(deepClone(data));
      setLoading(false);
    })();
  }, []);

  const update = <K extends keyof HomepageContent>(key: K, value: HomepageContent[K]) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setSaving(true);
    const result = await saveHomepageContent(content);
    setSaving(false);
    if (result.success) {
      setOriginalContent(deepClone(content));
      setSuccess('Homepage content saved successfully! Changes are now live.');
      setTimeout(() => setSuccess(''), 4000);
    } else {
      setError(result.error || 'Failed to save homepage content.');
    }
  };

  const handleCancel = () => {
    setContent(deepClone(originalContent));
    setError('');
    setSuccess('');
  };

  const handleReset = async () => {
    if (!confirm('Reset all homepage content to the original defaults? This cannot be undone.')) return;
    setError('');
    setSuccess('');
    setSaving(true);
    const result = await resetHomepageContent();
    setSaving(false);
    if (result.success) {
      const defaults = deepClone(DEFAULT_HOMEPAGE_CONTENT);
      setContent(defaults);
      setOriginalContent(defaults);
      setSuccess('Homepage content reset to defaults and saved.');
      setTimeout(() => setSuccess(''), 4000);
    } else {
      setError(result.error || 'Failed to reset homepage content.');
    }
  };

  const updateStep = (index: number, field: keyof HomepageHowItWorksStep, value: string) => {
    const steps = [...content.howItWorksSteps];
    steps[index] = { ...steps[index], [field]: value };
    update('howItWorksSteps', steps);
  };

  const addStep = () => {
    update('howItWorksSteps', [...content.howItWorksSteps, { icon: 'Zap', title: 'New Step', desc: 'Describe this step.' }]);
  };

  const removeStep = (index: number) => {
    update('howItWorksSteps', content.howItWorksSteps.filter((_, i) => i !== index));
  };

  const updateFeature = (index: number, field: keyof HomepageFeature, value: string) => {
    const features = [...content.features];
    features[index] = { ...features[index], [field]: value };
    update('features', features);
  };

  const addFeature = () => {
    update('features', [...content.features, { icon: 'Zap', title: 'New Feature', desc: 'Describe this feature.' }]);
  };

  const removeFeature = (index: number) => {
    update('features', content.features.filter((_, i) => i !== index));
  };

  const updateFaq = (index: number, field: keyof HomepageFaq, value: string) => {
    const faqs = [...content.faqs];
    faqs[index] = { ...faqs[index], [field]: value };
    update('faqs', faqs);
  };

  const addFaq = () => {
    update('faqs', [...content.faqs, { q: 'New Question?', a: 'Answer here.' }]);
  };

  const removeFaq = (index: number) => {
    update('faqs', content.faqs.filter((_, i) => i !== index));
  };

  const updateCategoryLabel = (index: number, value: string) => {
    const labels = [...content.taskCategoryLabels];
    labels[index] = value;
    update('taskCategoryLabels', labels);
  };

  const addCategoryLabel = () => {
    update('taskCategoryLabels', [...content.taskCategoryLabels, 'New Category']);
  };

  const removeCategoryLabel = (index: number) => {
    update('taskCategoryLabels', content.taskCategoryLabels.filter((_, i) => i !== index));
  };

  if (loading) return <Spinner size="lg" className="py-20" />;

  return (
    <AdminPageWrapper
      title="Homepage Editor"
      subtitle="Edit the content displayed on the ZAPZO homepage. Changes go live immediately after saving."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handleCancel} disabled={saving}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={handleReset} disabled={saving}>
            <RotateCcw className="h-4 w-4" /> Reset to Default
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : <><Save className="h-4 w-4" /> Save</>}
          </Button>
        </div>
      }
    >
      {error && <div className="mb-4 rounded-xl bg-danger-500/10 p-3 text-sm text-danger-400">{error}</div>}
      {success && <div className="mb-4 rounded-xl bg-accent-400/10 p-3 text-sm text-accent-400">{success}</div>}

      <div className="space-y-6">
        {/* Hero Section */}
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-brand-400" />
            <h2 className="font-bold text-white">Hero Section</h2>
          </div>
          <div className="space-y-5">
            <Input
              label="Hero Badge Text"
              value={content.heroBadge}
              onChange={(e) => update('heroBadge', e.target.value)}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Hero Heading Line 1"
                value={content.heroHeadingLine1}
                onChange={(e) => update('heroHeadingLine1', e.target.value)}
              />
              <Input
                label="Hero Heading Line 2"
                value={content.heroHeadingLine2}
                onChange={(e) => update('heroHeadingLine2', e.target.value)}
              />
            </div>
            <Textarea
              label="Hero Subtitle"
              value={content.heroSubtitle}
              onChange={(e) => update('heroSubtitle', e.target.value)}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Primary Button Text"
                value={content.heroPrimaryButtonText}
                onChange={(e) => update('heroPrimaryButtonText', e.target.value)}
              />
              <Input
                label="Primary Button URL"
                value={content.heroPrimaryButtonUrl}
                onChange={(e) => update('heroPrimaryButtonUrl', e.target.value)}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Secondary Button Text"
                value={content.heroSecondaryButtonText}
                onChange={(e) => update('heroSecondaryButtonText', e.target.value)}
              />
              <Input
                label="Secondary Button URL"
                value={content.heroSecondaryButtonUrl}
                onChange={(e) => update('heroSecondaryButtonUrl', e.target.value)}
              />
            </div>
            <Input
              label="Hero Disclaimer"
              value={content.heroDisclaimer}
              onChange={(e) => update('heroDisclaimer', e.target.value)}
            />
          </div>
        </Card>

        {/* How It Works */}
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-brand-400" />
            <h2 className="font-bold text-white">How It Works Section</h2>
          </div>
          <div className="space-y-5">
            <Input
              label="Section Heading"
              value={content.howItWorksHeading}
              onChange={(e) => update('howItWorksHeading', e.target.value)}
            />
            <Textarea
              label="Section Description"
              value={content.howItWorksDescription}
              onChange={(e) => update('howItWorksDescription', e.target.value)}
            />
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-50">Steps</h3>
                <Button size="sm" variant="secondary" onClick={addStep}>
                  <Plus className="h-4 w-4" /> Add Step
                </Button>
              </div>
              <div className="space-y-3">
                {content.howItWorksSteps.map((step, i) => (
                  <div key={i} className="rounded-xl border border-ink-200 bg-ink-900 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-ink-400" />
                      <span className="text-sm font-semibold text-ink-50">Step {i + 1}</span>
                      <button onClick={() => removeStep(i)} className="ml-auto rounded p-1 text-ink-400 hover:text-danger-400" title="Remove step">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="label">Icon</label>
                        <select
                          className="input cursor-pointer"
                          value={step.icon}
                          onChange={(e) => updateStep(i, 'icon', e.target.value)}
                        >
                          {ICON_OPTIONS.map((icon) => (
                            <option key={icon} value={icon}>{icon}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Title</label>
                        <input className="input" value={step.title} onChange={(e) => updateStep(i, 'title', e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Description</label>
                        <input className="input" value={step.desc} onChange={(e) => updateStep(i, 'desc', e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Features */}
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-brand-400" />
            <h2 className="font-bold text-white">Features Section</h2>
          </div>
          <div className="space-y-5">
            <Input
              label="Section Heading"
              value={content.featureHeading}
              onChange={(e) => update('featureHeading', e.target.value)}
            />
            <Textarea
              label="Section Description"
              value={content.featureDescription}
              onChange={(e) => update('featureDescription', e.target.value)}
            />
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-50">Feature Cards</h3>
                <Button size="sm" variant="secondary" onClick={addFeature}>
                  <Plus className="h-4 w-4" /> Add Feature
                </Button>
              </div>
              <div className="space-y-3">
                {content.features.map((feat, i) => (
                  <div key={i} className="rounded-xl border border-ink-200 bg-ink-900 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-ink-400" />
                      <span className="text-sm font-semibold text-ink-50">Feature {i + 1}</span>
                      <button onClick={() => removeFeature(i)} className="ml-auto rounded p-1 text-ink-400 hover:text-danger-400" title="Remove feature">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="label">Icon</label>
                        <select
                          className="input cursor-pointer"
                          value={feat.icon}
                          onChange={(e) => updateFeature(i, 'icon', e.target.value)}
                        >
                          {ICON_OPTIONS.map((icon) => (
                            <option key={icon} value={icon}>{icon}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Title</label>
                        <input className="input" value={feat.title} onChange={(e) => updateFeature(i, 'title', e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Description</label>
                        <input className="input" value={feat.desc} onChange={(e) => updateFeature(i, 'desc', e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Task Categories */}
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-brand-400" />
            <h2 className="font-bold text-white">Task Category Labels</h2>
          </div>
          <div className="space-y-3">
            {content.taskCategoryLabels.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  value={label}
                  onChange={(e) => updateCategoryLabel(i, e.target.value)}
                />
                <button onClick={() => removeCategoryLabel(i)} className="rounded-lg p-2 text-ink-400 hover:text-danger-400" title="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={addCategoryLabel}>
              <Plus className="h-4 w-4" /> Add Category
            </Button>
          </div>
        </Card>

        {/* FAQ */}
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-brand-400" />
            <h2 className="font-bold text-white">FAQ Section</h2>
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-50">Questions & Answers</h3>
              <Button size="sm" variant="secondary" onClick={addFaq}>
                <Plus className="h-4 w-4" /> Add FAQ
              </Button>
            </div>
            <div className="space-y-3">
              {content.faqs.map((faq, i) => (
                <div key={i} className="rounded-xl border border-ink-200 bg-ink-900 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-ink-400" />
                    <span className="text-sm font-semibold text-ink-50">FAQ {i + 1}</span>
                    <button onClick={() => removeFaq(i)} className="ml-auto rounded p-1 text-ink-400 hover:text-danger-400" title="Remove FAQ">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <input className="input" placeholder="Question" value={faq.q} onChange={(e) => updateFaq(i, 'q', e.target.value)} />
                    <textarea className="input min-h-[80px] resize-y" placeholder="Answer" value={faq.a} onChange={(e) => updateFaq(i, 'a', e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Final CTA & Footer */}
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-brand-400" />
            <h2 className="font-bold text-white">Final CTA & Footer</h2>
          </div>
          <div className="space-y-5">
            <Input
              label="Final CTA Heading"
              value={content.finalCtaHeading}
              onChange={(e) => update('finalCtaHeading', e.target.value)}
            />
            <Textarea
              label="Final CTA Description"
              value={content.finalCtaDescription}
              onChange={(e) => update('finalCtaDescription', e.target.value)}
            />
            <Textarea
              label="Footer Description"
              value={content.footerDescription}
              onChange={(e) => update('footerDescription', e.target.value)}
              hint="Leave empty to use the default footer."
            />
          </div>
        </Card>

        {/* Bottom action bar */}
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-ink-200 bg-ink-900/90 p-4 backdrop-blur-lg">
          <Button size="sm" variant="secondary" onClick={handleCancel} disabled={saving}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={handleReset} disabled={saving}>
            <RotateCcw className="h-4 w-4" /> Reset to Default
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : <><Save className="h-4 w-4" /> Save Changes</>}
          </Button>
        </div>
      </div>
    </AdminPageWrapper>
  );
}
