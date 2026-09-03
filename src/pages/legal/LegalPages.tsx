import { LegalLayout } from './LegalLayout';

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="August 2026">
      <h2 className="text-xl font-bold text-white">1. Acceptance of Terms</h2>
      <p>By creating an account or using ZAPZO, you agree to these Terms of Service. If you do not agree, do not use the platform.</p>

      <h2 className="text-xl font-bold text-white">2. What ZAPZO Is</h2>
      <p>ZAPZO is a task-and-referral rewards platform. Users complete verified tasks, submit proof, and earn rewards upon admin approval. Users can also refer friends and earn referral rewards when those friends complete qualifying tasks.</p>

      <h2 className="text-xl font-bold text-white">3. What ZAPZO Is Not</h2>
      <p>ZAPZO is NOT a gambling, betting, investment, or deposit-to-earn platform. We do not promise guaranteed income. Registration alone does not generate money. You should never pay money to access ordinary earning tasks.</p>

      <h2 className="text-xl font-bold text-white">4. Eligibility</h2>
      <p>You must be at least 18 years old and provide accurate information during registration. One account per person.</p>

      <h2 className="text-xl font-bold text-white">5. Tasks and Rewards</h2>
      <p>Task availability can change at any time. Rewards are credited only after admin verification of submitted proof. The platform reserves the right to reject submissions that do not meet task requirements.</p>

      <h2 className="text-xl font-bold text-white">6. Referral Program</h2>
      <p>Referral rewards are credited ONLY when a referred user completes a qualifying task that is approved by admin. Signup alone does not generate a referral reward. Self-referrals, duplicate referrals, and referral loops are prohibited and automatically prevented.</p>

      <h2 className="text-xl font-bold text-white">7. Withdrawals</h2>
      <p>Withdrawals are processed through manual admin review. V1 does not connect to a real payout API. Minimum withdrawal amounts are configurable and enforced server-side. If a withdrawal is rejected, reserved funds are released back to the user's wallet.</p>

      <h2 className="text-xl font-bold text-white">8. Prohibited Conduct</h2>
      <p>You may not: create multiple accounts, submit fraudulent proof, attempt self-referral, abuse the referral system, use automated tools to complete tasks, or attempt to manipulate the wallet system. Violations may result in reward reversal, account suspension, and permanent ban.</p>

      <h2 className="text-xl font-bold text-white">9. Fraud Protection</h2>
      <p>ZAPZO employs fraud detection including duplicate submission prevention, self-referral prevention, suspicious activity flagging, and admin review. Fraudulent activity may result in reward reversal and account suspension.</p>

      <h2 className="text-xl font-bold text-white">10. Limitation of Liability</h2>
      <p>ZAPZO is provided "as is." We are not liable for lost earnings due to task unavailability, verification rejections, or platform downtime. Earnings are not guaranteed.</p>

      <h2 className="text-xl font-bold text-white">11. Changes to Terms</h2>
      <p>We may update these terms at any time. Continued use after changes constitutes acceptance.</p>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="August 2026">
      <h2 className="text-xl font-bold text-white">1. Information We Collect</h2>
      <p>When you register, we collect your name, email, and optionally a referral code. When you complete tasks, we store your task submissions and proof. We also record wallet transactions, referrals, and withdrawal requests.</p>

      <h2 className="text-xl font-bold text-white">2. How We Use Your Information</h2>
      <p>Your information is used to: manage your account, verify task completions, process withdrawals, track referrals, prevent fraud, and maintain audit logs of admin actions.</p>

      <h2 className="text-xl font-bold text-white">3. Data Security</h2>
      <p>We use Supabase authentication with Row Level Security. Your data is protected by database-level access controls. Service-role keys are never exposed in frontend code. Admin actions are logged in an audit trail.</p>

      <h2 className="text-xl font-bold text-white">4. Data Access</h2>
      <p>You can access your own profile, wallet transactions, submissions, referrals, and withdrawals at any time. Admins can access management data for platform operation. We do not sell your data to third parties.</p>

      <h2 className="text-xl font-bold text-white">5. Withdrawal Payout Details</h2>
      <p>Payout details you provide (UPI ID or bank account info) are stored securely and used only for processing withdrawals. They are visible to admins for payout processing.</p>

      <h2 className="text-xl font-bold text-white">6. Data Retention</h2>
      <p>Your data is retained while your account is active. Transaction records and audit logs are retained for platform integrity even after account deletion.</p>

      <h2 className="text-xl font-bold text-white">7. Your Rights</h2>
      <p>You can request data export or account deletion by contacting support. Note that transaction records may be retained for audit purposes.</p>
    </LegalLayout>
  );
}

export function ResponsibleEarningPage() {
  return (
    <LegalLayout title="Responsible Earning" lastUpdated="August 2026">
      <div className="rounded-xl bg-brand-600/10 p-5">
        <p className="font-semibold text-brand-400">ZAPZO is committed to transparency and responsible earning. Please read this page carefully before participating.</p>
      </div>

      <h2 className="text-xl font-bold text-white">Core Principles</h2>
      <p>ZAPZO is a legitimate platform where users earn rewards by completing genuine tasks. We do not operate a gambling, betting, investment, or deposit-to-earn system.</p>

      <h2 className="text-xl font-bold text-white">What You Should Know</h2>
      <ul className="list-disc pl-5 space-y-2">
        <li><strong>Earnings are not guaranteed.</strong> Your earnings depend entirely on the availability of tasks and successful verification of your submissions.</li>
        <li><strong>Task availability can change.</strong> Tasks may be added, paused, or completed at any time without prior notice.</li>
        <li><strong>Rewards require verification.</strong> All task submissions are manually reviewed by our admin team before rewards are credited.</li>
        <li><strong>Fraudulent activity may result in reward reversal.</strong> Submitting fake proof, creating multiple accounts, or abusing the referral system will lead to reward reversal and potential account suspension.</li>
        <li><strong>Never pay to earn.</strong> You should never pay money to anyone to access ordinary earning tasks on ZAPZO. If someone asks you for payment, report them to support immediately.</li>
      </ul>

      <h2 className="text-xl font-bold text-white">Referral Program Ethics</h2>
      <p>Referral rewards are earned only when a referred friend genuinely completes a qualifying task that is approved. Signup alone does not generate a reward. This ensures referrals represent real user engagement, not empty signups.</p>
      <p>Self-referrals, duplicate referral attempts, and referral loops are automatically blocked. Attempting to abuse the referral system will flag your account for admin review.</p>

      <h2 className="text-xl font-bold text-white">Withdrawal Transparency</h2>
      <p>Withdrawals are processed through manual admin review. V1 does not connect to a real payout API — all payouts are processed manually by our team. If a withdrawal is rejected, the reserved amount is automatically released back to your wallet.</p>

      <h2 className="text-xl font-bold text-white">Reporting Issues</h2>
      <p>If you encounter suspicious activity, believe your account has been unfairly flagged, or someone asks you for payment to access tasks, contact our support team immediately.</p>
    </LegalLayout>
  );
}

export function ContactPage() {
  return (
    <LegalLayout title="Contact Us">
      <p>We're here to help. Reach out through any of the channels below.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-ink-200 p-5">
          <h3 className="font-bold text-white">General Support</h3>
          <p className="mt-2 text-sm text-ink-400">For account issues, task questions, or referral problems.</p>
          <p className="mt-3 text-sm font-medium text-brand-400">support@zapzo.example</p>
        </div>
        <div className="rounded-xl border border-ink-200 p-5">
          <h3 className="font-bold text-white">Report Fraud</h3>
          <p className="mt-2 text-sm text-ink-400">Report suspicious activity or payment-for-task scams.</p>
          <p className="mt-3 text-sm font-medium text-danger-400">fraud@zapzo.example</p>
        </div>
      </div>
      <div className="mt-6 rounded-xl bg-ink-800/50 p-5">
        <p className="text-sm text-ink-400">For development/demo purposes: this is a demonstration platform. In a production deployment, these contact details would connect to a real support team.</p>
      </div>
    </LegalLayout>
  );
}

export function SupportPage() {
  return (
    <LegalLayout title="Support Center">
      <h2 className="text-xl font-bold text-white">Getting Help</h2>
      <p>If you need assistance with your account, tasks, referrals, or withdrawals, here are the most common questions and solutions.</p>

      <h2 className="text-xl font-bold text-white">Common Issues</h2>
      <div className="space-y-3">
        {[
          { q: 'My task submission was rejected', a: 'Check the rejection reason on your submission. Make sure you follow task instructions carefully and provide detailed proof.' },
          { q: 'My referral shows as pending', a: 'Referrals become qualified only after the referred user completes and gets an approved task. Signup alone does not qualify a referral.' },
          { q: 'My withdrawal is taking long', a: 'Withdrawals are manually reviewed. Please allow time for admin processing. If rejected, funds are released back to your wallet.' },
          { q: 'My balance seems wrong', a: 'Your available balance excludes pending withdrawals. Check your wallet ledger for a complete transaction history.' },
          { q: 'I was suspended', a: 'Suspensions occur due to fraudulent activity. Contact support if you believe this is an error.' },
        ].map((item) => (
          <div key={item.q} className="rounded-xl border border-ink-200 p-4">
            <p className="font-semibold text-white">{item.q}</p>
            <p className="mt-1 text-sm text-ink-400">{item.a}</p>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-bold text-white">Still Need Help?</h2>
      <p>Visit our <a href="/contact" className="text-brand-400 font-medium">contact page</a> to reach our support team.</p>
    </LegalLayout>
  );
}

export function AboutPage() {
  return (
    <LegalLayout title="About ZAPZO">
      <div className="rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-glow-purple">
        <h2 className="text-2xl font-bold">Do Tasks. Earn Rewards.</h2>
        <p className="mt-2 text-white/70">ZAPZO is a legitimate task-and-referral rewards platform built on transparency and trust.</p>
      </div>

      <h2 className="text-xl font-bold text-white">Our Mission</h2>
      <p>We believe earning rewards should be simple, transparent, and fair. ZAPZO connects users with verified tasks and pays rewards only after genuine completion — no deposits, no promises, no tricks.</p>

      <h2 className="text-xl font-bold text-white">How It Works</h2>
      <p>Users create accounts, browse available tasks, complete them, and submit proof. Our admin team reviews each submission. Approved tasks credit rewards directly to the user's wallet. Users can also refer friends and earn referral rewards when those friends complete qualifying tasks.</p>

      <h2 className="text-xl font-bold text-white">Our Commitment</h2>
      <ul className="list-disc pl-5 space-y-2">
        <li>Transparent wallet ledger — see every transaction</li>
        <li>Manual verification — real humans review submissions</li>
        <li>Qualified referrals — rewards for genuine engagement, not empty signups</li>
        <li>Fraud protection — proactive detection and prevention</li>
        <li>Responsible earning — no deposits, no guaranteed income claims</li>
      </ul>
    </LegalLayout>
  );
}
