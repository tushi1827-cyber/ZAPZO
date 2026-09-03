export type TaskCategory = 'social' | 'survey' | 'website' | 'app' | 'learning' | 'other';
export type TaskStatus = 'draft' | 'active' | 'paused' | 'completed' | 'expired';
export type VerificationType = 'manual' | 'automatic';
export type AutoVerificationType = 'link_click' | 'keyword_check';

export interface AutoVerificationConfig {
  type: AutoVerificationType;
  target_url?: string;
  keywords?: string[];
}

export interface AutoVerificationResult {
  verified: boolean;
  reason: string;
}
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type ReferralStatus = 'pending' | 'qualified' | 'reversed';
export type WalletTxType =
  | 'task_reward'
  | 'referral_reward'
  | 'bonus'
  | 'adjustment'
  | 'withdrawal'
  | 'withdrawal_reversal';
export type WalletTxStatus = 'pending' | 'completed' | 'reversed';
export type WithdrawalMethod = 'upi' | 'bank_transfer';
export type WithdrawalStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'paid';

export interface Profile {
  id: string;
  name: string;
  referral_code: string;
  referred_by: string | null;
  is_admin: boolean;
  is_suspended: boolean;
  fraud_signals: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  instructions: string;
  category: TaskCategory;
  reward: number;
  max_completions: number;
  approved_count: number;
  verification_type: VerificationType;
  status: TaskStatus;
  task_image_url: string | null;
  task_link: string | null;
  auto_verification_type: AutoVerificationType | null;
  auto_verification_config: AutoVerificationConfig | null;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskSubmission {
  id: string;
  task_id: string;
  user_id: string;
  proof_text: string;
  proof_image_url: string | null;
  status: SubmissionStatus;
  rejection_reason: string | null;
  reward_amount: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  auto_verification_result: AutoVerificationResult | null;
  is_auto_verified: boolean;
  created_at: string;
  updated_at: string;
  task?: Task;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string;
  status: ReferralStatus;
  qualified_at: string | null;
  reward_amount: number;
  created_at: string;
  referred?: { name: string; referral_code: string; created_at: string };
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: WalletTxType;
  amount: number;
  status: WalletTxStatus;
  reference_id: string | null;
  description: string;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  method: WithdrawalMethod;
  payout_details: string;
  status: WithdrawalStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  profile?: { name: string; referral_code: string };
}

export interface Settings {
  id: number;
  min_withdrawal: number;
  referral_reward: number;
  site_name: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export type RiskEventType =
  | 'duplicate_submission'
  | 'rapid_submission'
  | 'excessive_rejection'
  | 'referral_abuse'
  | 'rate_limit_block';

export type RiskReviewStatus = 'none' | 'under_review' | 'resolved';

export interface UserRiskProfile {
  user_id: string;
  risk_score: number;
  duplicate_submission_count: number;
  rapid_submission_count: number;
  excessive_rejection_count: number;
  referral_abuse_count: number;
  review_status: RiskReviewStatus;
  admin_notes: string;
  last_flagged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiskEvent {
  id: string;
  user_id: string;
  event_type: RiskEventType;
  description: string;
  risk_points: number;
  task_id: string | null;
  submission_id: string | null;
  created_at: string;
  profile?: { name: string; referral_code: string; is_suspended: boolean };
  task?: { title: string };
}

export interface DashboardStats {
  availableBalance: number;
  pendingRewards: number;
  totalEarned: number;
  referralEarnings: number;
  tasksCompleted: number;
  qualifiedReferrals: number;
  totalWithdrawals: number;
}
