import { LegalLayout } from './LegalLayout';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';

const LAST_UPDATED = 'October 2026';

function PolicySection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-ink-800/30 p-5 sm:p-6">
      <h2 className="text-lg font-bold text-white sm:text-xl">
        <span className="text-brand-400">{number}.</span> {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-400 sm:text-[15px]">
        {children}
      </div>
    </div>
  );
}

function PolicyList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions" description="Read the Terms & Conditions for using ZAPZO, including eligibility, tasks, rewards, withdrawals, referrals, and prohibited activities." lastUpdated={LAST_UPDATED}>
      <div className="rounded-xl bg-gradient-to-br from-brand-600/10 to-brand-900/5 p-5 border border-brand-600/20">
        <p className="text-sm text-ink-400">
          These Terms & Conditions govern your use of ZAPZO, a task-and-referral rewards platform. By creating an account or using the platform, you agree to these terms. If you do not agree, please do not use the platform.
        </p>
      </div>

      <PolicySection number="1" title="Introduction">
        <p>ZAPZO is a platform where users can complete tasks, submit proof of completion, and earn rewards upon verification. Users may also refer others and earn referral rewards when those referrals complete qualifying actions.</p>
        <p>ZAPZO is not a gambling, betting, investment, or deposit-to-earn platform. We do not guarantee any specific earnings. Registration alone does not generate money. You should never pay money to access ordinary earning tasks on the platform.</p>
      </PolicySection>

      <PolicySection number="2" title="Eligibility">
        <p>You must meet the following requirements to use ZAPZO:</p>
        <PolicyList items={[
          <span>You must be of legal age in your jurisdiction to enter into binding agreements.</span>,
          <span>You must provide accurate and truthful information during registration and throughout your use of the platform.</span>,
          <span>One account per person. Creating multiple accounts is prohibited.</span>,
          <span>You are responsible for maintaining the security of your account credentials.</span>,
        ]} />
      </PolicySection>

      <PolicySection number="3" title="Account Registration">
        <p>To use ZAPZO, you must register an account using a valid email address. You agree to:</p>
        <PolicyList items={[
          <span>Provide accurate, current, and complete information during registration.</span>,
          <span>Keep your account credentials confidential and not share them with others.</span>,
          <span>Notify us immediately if you suspect unauthorized access to your account.</span>,
          <span>Accept responsibility for all activities that occur under your account.</span>,
        ]} />
      </PolicySection>

      <PolicySection number="4" title="User Responsibilities">
        <p>As a user of ZAPZO, you are responsible for:</p>
        <PolicyList items={[
          <span>Completing tasks genuinely and submitting accurate proof of completion.</span>,
          <span>Following the specific instructions provided for each task.</span>,
          <span>Providing correct payment details for withdrawals.</span>,
          <span>Maintaining only one account.</span>,
          <span>Not attempting to manipulate, reverse-engineer, or disrupt the platform.</span>,
          <span>Refraining from any activity that could harm the platform or other users.</span>,
        ]} />
      </PolicySection>

      <PolicySection number="5" title="Tasks and Submissions">
        <p>Tasks on ZAPZO may include various activities such as social media engagement, content creation, surveys, or other actions specified by the platform. The following rules apply:</p>
        <PolicyList items={[
          <span>Task availability may change at any time. Tasks may be added, paused, or completed without prior notice.</span>,
          <span>You must complete tasks honestly and provide genuine proof of completion.</span>,
          <span>Some tasks may require proof text, screenshots, or other documentation as specified.</span>,
          <span>Submitting fake, copied, or misleading proof may result in rejection and account review.</span>,
          <span>Rate limits may apply to prevent abuse of the submission system.</span>,
        ]} />
      </PolicySection>

      <PolicySection number="6" title="Task Approval and Rejection">
        <p>All task submissions are reviewed by the platform before rewards are credited. The review process may involve:</p>
        <PolicyList items={[
          <span>Manual verification by the admin team for manually verified tasks.</span>,
          <span>Automatic verification for certain task types, where applicable.</span>,
          <span>Checking that the submitted proof meets the task requirements.</span>,
        ]} />
        <p>Submissions may be rejected if:</p>
        <PolicyList items={[
          <span>The proof does not meet the task instructions.</span>,
          <span>The submission appears fraudulent, duplicated, or auto-generated.</span>,
          <span>The task was not completed as described.</span>,
        ]} />
        <p>Rejected submissions may include a reason. You may be allowed to resubmit depending on the task and platform rules.</p>
      </PolicySection>

      <PolicySection number="7" title="Rewards and Wallet Balance">
        <p>Rewards are credited to your ZAPZO wallet only after your task submission is approved. The following applies:</p>
        <PolicyList items={[
          <span>Rewards are not guaranteed and depend on task availability and successful verification.</span>,
          <span>Your wallet balance reflects approved rewards and may be affected by pending withdrawals.</span>,
          <span>The platform reserves the right to reverse rewards credited due to errors, fraud, or policy violations.</span>,
          <span>Your wallet ledger provides a complete record of all transactions.</span>,
        ]} />
      </PolicySection>

      <PolicySection number="8" title="Withdrawals">
        <p>Withdrawals allow you to request payout of your wallet balance. The following applies:</p>
        <PolicyList items={[
          <span>Withdrawals are subject to minimum amount requirements as configured by the platform.</span>,
          <span>Withdrawals are processed through manual admin review and are not guaranteed to be instant.</span>,
          <span>You must provide accurate payment details. Incorrect details may result in processing delays or rejection.</span>,
          <span>Funds are reserved from your wallet when a withdrawal request is submitted.</span>,
          <span>If a withdrawal is rejected, the reserved amount is released back to your wallet.</span>,
          <span>For full details, please review our <Link to="/withdrawal-policy" className="text-brand-400 font-medium hover:text-brand-300">Withdrawal Policy</Link>.</span>,
        ]} />
      </PolicySection>

      <PolicySection number="9" title="Referral Program">
        <p>ZAPZO offers a referral program that rewards users for inviting others to the platform. The following rules apply:</p>
        <PolicyList items={[
          <span>Referral rewards are credited only when a referred user completes a qualifying task that is approved by the platform.</span>,
          <span>Signup alone does not generate a referral reward.</span>,
          <span>Self-referrals, duplicate referrals, and referral loops are prohibited and automatically prevented.</span>,
          <span>Attempting to abuse the referral system may result in account review and suspension.</span>,
          <span>The platform may modify referral reward amounts or rules at any time.</span>,
        ]} />
      </PolicySection>

      <PolicySection number="10" title="Prohibited Activities">
        <p>The following activities are strictly prohibited on ZAPZO:</p>
        <PolicyList items={[
          <span>Creating multiple accounts or using false identities.</span>,
          <span>Submitting fraudulent, fake, or plagiarized proof.</span>,
          <span>Using automated tools, bots, or scripts to complete tasks.</span>,
          <span>Attempting self-referral or referral manipulation.</span>,
          <span>Attempting to manipulate the wallet or withdrawal system.</span>,
          <span>Reverse-engineering, hacking, or disrupting platform infrastructure.</span>,
          <span>Engaging in any activity intended to defraud the platform or other users.</span>,
        ]} />
        <p>Violation of these rules may result in reward reversal, submission rejection, account flagging, suspension, or permanent termination according to platform rules.</p>
      </PolicySection>

      <PolicySection number="11" title="Account Suspension or Termination">
        <p>The platform reserves the right to suspend or terminate accounts that violate these terms or engage in prohibited activities. Actions may include:</p>
        <PolicyList items={[
          <span>Flagging your account for review based on suspicious activity.</span>,
          <span>Suspending your ability to submit tasks or request withdrawals.</span>,
          <span>Permanently banning your account for severe or repeated violations.</span>,
          <span>Reversing rewards or transactions associated with fraudulent activity.</span>,
        ]} />
        <p>If you believe your account was suspended in error, you may contact support to request a review.</p>
      </PolicySection>

      <PolicySection number="12" title="Platform Changes">
        <p>ZAPZO may modify, update, or discontinue features, tasks, reward structures, withdrawal methods, or any aspect of the platform at any time without prior notice. The platform is not liable for any loss of earnings due to such changes.</p>
        <p>We may also update these Terms & Conditions from time to time. Continued use of the platform after changes constitutes acceptance of the updated terms.</p>
      </PolicySection>

      <PolicySection number="13" title="Disclaimer">
        <p>ZAPZO is provided on an "as is" and "as available" basis. We do not guarantee that:</p>
        <PolicyList items={[
          <span>Tasks will always be available.</span>,
          <span>Submissions will always be approved.</span>,
          <span>Specific earnings amounts will be achieved.</span>,
          <span>Withdrawals will be processed within a specific timeframe.</span>,
          <span>The platform will be uninterrupted or error-free.</span>,
        ]} />
        <p>Earnings on ZAPZO depend on task availability, successful verification, and adherence to platform rules. We do not make any guarantees regarding income or rewards.</p>
      </PolicySection>

      <PolicySection number="14" title="Limitation of Liability">
        <p>To the maximum extent permitted by law, ZAPZO shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of earnings, data, or goodwill, arising from your use of or inability to use the platform.</p>
        <p>The platform is not responsible for losses due to task unavailability, verification rejections, platform downtime, or withdrawal processing delays.</p>
      </PolicySection>

      <PolicySection number="15" title="Contact / Support">
        <p>If you have questions about these Terms & Conditions, or if you need help with your account, tasks, referrals, or withdrawals, you can reach us through our <Link to="/support" className="text-brand-400 font-medium hover:text-brand-300">Support Center</Link> or <Link to="/contact" className="text-brand-400 font-medium hover:text-brand-300">Contact page</Link>.</p>
        <p>If you encounter suspicious activity or believe someone is asking you for payment to access tasks, please report it to support immediately.</p>
      </PolicySection>

      <div className="rounded-xl bg-ink-800/50 p-4 text-center">
        <p className="text-sm text-ink-400">Last Updated: {LAST_UPDATED}</p>
      </div>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" description="Learn how ZAPZO collects, uses, and protects your personal information, including account data, task submissions, wallet details, and support communications." lastUpdated={LAST_UPDATED}>
      <div className="rounded-xl bg-gradient-to-br from-brand-600/10 to-brand-900/5 p-5 border border-brand-600/20">
        <p className="text-sm text-ink-400">
          This Privacy Policy explains how ZAPZO collects, uses, and protects your information when you use our task-and-referral rewards platform. By using ZAPZO, you consent to the practices described in this policy.
        </p>
      </div>

      <PolicySection number="1" title="Information We Collect">
        <p>We collect information that you provide directly to us and information gathered through your use of the platform. This includes:</p>
        <PolicyList items={[
          <span>Account information (name, email, referral code).</span>,
          <span>Task and submission data (proof text, screenshots, submission status).</span>,
          <span>Referral information (who you referred and referral status).</span>,
          <span>Wallet and withdrawal information (balance, transactions, payout details).</span>,
          <span>Support communication (messages, attachments, ticket history).</span>,
        ]} />
      </PolicySection>

      <PolicySection number="2" title="Account Information">
        <p>When you register on ZAPZO, we collect:</p>
        <PolicyList items={[
          <span>Your name and email address.</span>,
          <span>A referral code if you were referred by another user.</span>,
          <span>Authentication credentials managed securely through our authentication provider.</span>,
        ]} />
        <p>This information is used to create and manage your account and to communicate with you about platform activity.</p>
      </PolicySection>

      <PolicySection number="3" title="Task and Submission Data">
        <p>When you complete tasks and submit proof, we collect and store:</p>
        <PolicyList items={[
          <span>The text proof you submit for each task.</span>,
          <span>Screenshot or image uploads associated with your submissions.</span>,
          <span>Submission status (pending, approved, rejected) and review details.</span>,
          <span>Timestamps of your submissions and reviews.</span>,
        ]} />
        <p>This data is used to verify task completion, manage the review process, and maintain records of platform activity.</p>
      </PolicySection>

      <PolicySection number="4" title="Referral Information">
        <p>When you participate in the referral program, we collect:</p>
        <PolicyList items={[
          <span>Your unique referral code.</span>,
          <span>Information about users you have referred.</span>,
          <span>Referral status and whether the referral has qualified.</span>,
          <span>Referral reward amounts credited to your account.</span>,
        ]} />
        <p>This information is used to manage the referral program and prevent abuse such as self-referrals or duplicate referrals.</p>
      </PolicySection>

      <PolicySection number="5" title="Wallet and Withdrawal Information">
        <p>To manage rewards and process withdrawals, we collect:</p>
        <PolicyList items={[
          <span>Your wallet balance and transaction history.</span>,
          <span>Withdrawal request details (amount, method, payout details).</span>,
          <span>UPI ID, bank account details, or gift card email address as provided by you.</span>,
          <span>Withdrawal status and review information.</span>,
        ]} />
        <p>Payout details are used solely for processing your withdrawal requests and are visible to authorized administrators for payout processing.</p>
      </PolicySection>

      <PolicySection number="6" title="Support Information">
        <p>When you contact support, we collect:</p>
        <PolicyList items={[
          <span>Your support ticket subject, category, and messages.</span>,
          <span>Any attachments you provide (screenshots, documents).</span>,
          <span>Communication history between you and the support team.</span>,
        ]} />
        <p>This information is used to resolve your support requests and maintain a record of communications.</p>
      </PolicySection>

      <PolicySection number="7" title="How We Use Information">
        <p>We use the information we collect to:</p>
        <PolicyList items={[
          <span>Create and manage your account.</span>,
          <span>Verify task completions and process rewards.</span>,
          <span>Process withdrawal requests and manage payouts.</span>,
          <span>Track and manage the referral program.</span>,
          <span>Detect and prevent fraud, abuse, and prohibited activities.</span>,
          <span>Maintain audit logs of admin actions for platform integrity.</span>,
          <span>Communicate with you about your account, tasks, and withdrawals.</span>,
          <span>Provide support and resolve issues.</span>,
        ]} />
        <p>We do not sell your personal data to third parties.</p>
      </PolicySection>

      <PolicySection number="8" title="Authentication and Security">
        <p>We use secure authentication with Row Level Security (RLS) to protect your data. Security measures include:</p>
        <PolicyList items={[
          <span>Database-level access controls that restrict data access based on user identity.</span>,
          <span>Service-role credentials that are never exposed in frontend code.</span>,
          <span>Audit logging of admin actions for accountability.</span>,
          <span>Fraud detection systems that monitor for suspicious activity.</span>,
        ]} />
        <p>While we take reasonable measures to protect your data, no system is completely secure. You are responsible for keeping your account credentials safe.</p>
      </PolicySection>

      <PolicySection number="9" title="Service Providers">
        <p>ZAPZO uses third-party service providers to deliver platform functionality, including:</p>
        <PolicyList items={[
          <span>Database and authentication infrastructure.</span>,
          <span>Email delivery services for notifications.</span>,
          <span>File storage for task images and support attachments.</span>,
        ]} />
        <p>These providers have access to only the information necessary to perform their functions and are bound by confidentiality obligations.</p>
      </PolicySection>

      <PolicySection number="10" title="Data Retention">
        <p>Your data is retained as follows:</p>
        <PolicyList items={[
          <span>Account data is retained while your account is active.</span>,
          <span>Task submission data and proof are retained for platform integrity and audit purposes.</span>,
          <span>Wallet transaction records are retained even after account deletion for audit and compliance purposes.</span>,
          <span>Support ticket communications are retained for a reasonable period to assist with future inquiries.</span>,
        ]} />
      </PolicySection>

      <PolicySection number="11" title="User Rights">
        <p>You have the following rights regarding your data:</p>
        <PolicyList items={[
          <span>Access: You can view your profile, wallet transactions, submissions, referrals, and withdrawals at any time through the platform.</span>,
          <span>Correction: You can update certain profile information through your account settings.</span>,
          <span>Deletion: You can request account deletion by contacting support. Note that transaction records and audit logs may be retained for platform integrity.</span>,
          <span>Questions: You can contact support with any questions about your data.</span>,
        ]} />
      </PolicySection>

      <PolicySection number="12" title="Cookies / Local Storage">
        <p>ZAPZO uses local storage and similar technologies to:</p>
        <PolicyList items={[
          <span>Maintain your authentication session.</span>,
          <span>Store user preferences such as theme settings.</span>,
          <span>Improve platform performance and user experience.</span>,
        ]} />
        <p>We do not use tracking cookies for advertising purposes. You can clear local storage through your browser settings, though this may require you to log in again.</p>
      </PolicySection>

      <PolicySection number="13" title="Children's Privacy">
        <p>ZAPZO is not intended for use by individuals under the legal age in their jurisdiction. We do not knowingly collect information from minors. If you believe a minor has registered an account, please contact support so we can take appropriate action.</p>
      </PolicySection>

      <PolicySection number="14" title="Policy Changes">
        <p>We may update this Privacy Policy from time to time. When we do, we will update the "Last Updated" date at the bottom of this page. Continued use of the platform after changes constitutes acceptance of the updated policy.</p>
        <p>We encourage you to review this policy periodically to stay informed about how we handle your information.</p>
      </PolicySection>

      <PolicySection number="15" title="Contact / Support">
        <p>If you have questions about this Privacy Policy or how your data is handled, please contact us through our <Link to="/support" className="text-brand-400 font-medium hover:text-brand-300">Support Center</Link> or <Link to="/contact" className="text-brand-400 font-medium hover:text-brand-300">Contact page</Link>.</p>
      </PolicySection>

      <div className="rounded-xl bg-ink-800/50 p-4 text-center">
        <p className="text-sm text-ink-400">Last Updated: {LAST_UPDATED}</p>
      </div>
    </LegalLayout>
  );
}

export function WithdrawalPolicyPage() {
  return (
    <LegalLayout title="Withdrawal Policy" description="ZAPZO's Withdrawal Policy explains eligibility, available methods, processing, rejection reasons, gift cards, and important payment detail guidelines." lastUpdated={LAST_UPDATED}>
      <div className="rounded-xl bg-gradient-to-br from-brand-600/10 to-brand-900/5 p-5 border border-brand-600/20">
        <p className="text-sm text-ink-400">
          This Withdrawal Policy explains how withdrawals work on ZAPZO, including eligibility, available methods, processing, and important information about payout details. Withdrawals are processed through manual admin review and are not guaranteed to be instant.
        </p>
      </div>

      <PolicySection number="1" title="Withdrawal Eligibility">
        <p>To request a withdrawal on ZAPZO, the following conditions must be met:</p>
        <PolicyList items={[
          <span>You must have an active ZAPZO account in good standing.</span>,
          <span>Your available wallet balance must meet the platform's minimum withdrawal threshold.</span>,
          <span>Your account must not be suspended or flagged for review.</span>,
          <span>You must not have a pending or processing withdrawal request. Only one withdrawal request may be active at a time.</span>,
        ]} />
        <p>Available balance excludes amounts already reserved for pending withdrawal requests.</p>
      </PolicySection>

      <PolicySection number="2" title="Minimum Withdrawal Rules">
        <p>The platform enforces a minimum withdrawal amount, which is configurable and may change over time. The current minimum is displayed on the withdrawal page when you initiate a request.</p>
        <p>If your balance is below the minimum withdrawal amount, you will need to complete additional tasks to increase your balance before requesting a withdrawal.</p>
      </PolicySection>

      <PolicySection number="3" title="Available Withdrawal Methods">
        <p>ZAPZO supports the following withdrawal methods:</p>
        <PolicyList items={[
          <span><strong className="text-ink-50">UPI:</strong> Transfer to a valid UPI ID.</span>,
          <span><strong className="text-ink-50">Bank Transfer:</strong> Direct deposit to your bank account (requires account holder name, account number, IFSC code, and bank name).</span>,
          <span><strong className="text-ink-50">Gift Cards:</strong> Redeem your balance for Amazon, Flipkart, or Google Play gift cards, delivered to your email.</span>,
        ]} />
        <p>The availability of specific methods may change at the platform's discretion. Gift card denominations are displayed on the withdrawal page and may vary by provider.</p>
      </PolicySection>

      <PolicySection number="4" title="Processing and Review Process">
        <p>All withdrawal requests go through the following process:</p>
        <PolicyList items={[
          <span>When you submit a withdrawal request, the requested amount is immediately reserved from your wallet balance.</span>,
          <span>Your request enters a pending status and is queued for admin review.</span>,
          <span>The admin team reviews the request, including verifying account standing and payment details.</span>,
          <span>If approved, the payout is processed through the selected method. The status changes to "processing" and then "paid" upon completion.</span>,
          <span>If rejected, the reserved amount is released back to your wallet and the status changes to "rejected" with a reason.</span>,
        ]} />
        <p>Withdrawals are processed manually and are not guaranteed to be instant. Processing times may vary based on the volume of requests and the selected payout method.</p>
      </PolicySection>

      <PolicySection number="5" title="Possible Rejection Reasons">
        <p>A withdrawal request may be rejected for reasons including but not limited to:</p>
        <PolicyList items={[
          <span>Incorrect or invalid payment details (UPI ID, bank account, IFSC code, or email).</span>,
          <span>Suspicious account activity or fraud flags.</span>,
          <span>Account suspension or review status at the time of processing.</span>,
          <span>Insufficient eligible balance after reward reversal or adjustment.</span>,
          <span>Duplicate or fraudulent withdrawal requests.</span>,
        ]} />
        <p>If your withdrawal is rejected, the full reserved amount is returned to your wallet. You may correct any issues and submit a new request.</p>
      </PolicySection>

      <PolicySection number="6" title="Duplicate or Fraudulent Requests">
        <p>Submitting duplicate, fraudulent, or manipulated withdrawal requests is prohibited. The platform employs detection mechanisms to identify:</p>
        <PolicyList items={[
          <span>Duplicate withdrawal attempts.</span>,
          <span>Requests from accounts engaged in fraudulent activity.</span>,
          <span>Manipulated payment details or attempts to exploit the withdrawal system.</span>,
        ]} />
        <p>Such activity may result in rejection of the request, account flagging, suspension, or permanent termination.</p>
      </PolicySection>

      <PolicySection number="7" title="Reversed Transactions">
        <p>In certain situations, a withdrawal that has been approved or processed may need to be reversed. This may occur due to:</p>
        <PolicyList items={[
          <span>Errors in the payout process.</span>,
          <span>Discovery of fraudulent activity associated with the withdrawn rewards.</span>,
          <span>Reward reversals that affect the account balance after a withdrawal was approved.</span>,
        ]} />
        <p>If a reversal occurs, the transaction will be adjusted and the status updated accordingly. The platform will make reasonable efforts to communicate the reason for the reversal.</p>
      </PolicySection>

      <PolicySection number="8" title="Gift Card Withdrawals">
        <p>When requesting a gift card withdrawal, please note:</p>
        <PolicyList items={[
          <span>You must select from available denominations displayed on the withdrawal page.</span>,
          <span>You must provide a valid email address where the gift card will be delivered.</span>,
          <span>Gift cards are processed manually after admin approval and sent to your email.</span>,
          <span>Processing may take additional time compared to UPI or bank transfers.</span>,
          <span>Ensure your email address is correct before submitting. The platform is not responsible for gift cards sent to an incorrect email address provided by you.</span>,
        ]} />
      </PolicySection>

      <PolicySection number="9" title="Incorrect Payment Details">
        <p>You are responsible for providing accurate and complete payment details when requesting a withdrawal. Please note:</p>
        <PolicyList items={[
          <span>Double-check your UPI ID, bank account number, IFSC code, and bank name before submitting.</span>,
          <span>For gift cards, verify your email address is correct and accessible.</span>,
          <span>The platform is not responsible for funds sent to incorrect payment details provided by you.</span>,
          <span>If you realize you submitted incorrect details, contact support immediately. We may be able to halt processing if the request has not yet been paid.</span>,
        ]} />
      </PolicySection>

      <PolicySection number="10" title="Processing Delays">
        <p>Withdrawal processing may experience delays due to:</p>
        <PolicyList items={[
          <span>High volume of withdrawal requests.</span>,
          <span>Manual review requirements for flagged accounts.</span>,
          <span>Gift card processing times from third-party providers.</span>,
          <span>Platform maintenance or downtime.</span>,
          <span>Holidays or weekends.</span>,
        ]} />
        <p>The platform strives to process withdrawals in a timely manner but does not guarantee specific processing times. If your withdrawal has been pending for an extended period, you may contact support for an update.</p>
      </PolicySection>

      <PolicySection number="11" title="Support and Contact">
        <p>If you have questions about a withdrawal, need to report an issue with payment details, or want an update on a pending request, you can reach us through:</p>
        <PolicyList items={[
          <span>Our in-platform <Link to="/dashboard/support" className="text-brand-400 font-medium hover:text-brand-300">support ticket system</Link> (available when logged in).</span>,
          <span>Our public <Link to="/support" className="text-brand-400 font-medium hover:text-brand-300">Support Center</Link> for general questions.</span>,
          <span>Our <Link to="/contact" className="text-brand-400 font-medium hover:text-brand-300">Contact page</Link> for direct inquiries.</span>,
        ]} />
        <p>Please include your withdrawal request details (method, amount, and approximate date) when contacting support for faster resolution.</p>
      </PolicySection>

      <div className="rounded-xl bg-ink-800/50 p-4 text-center">
        <p className="text-sm text-ink-400">Last Updated: {LAST_UPDATED}</p>
      </div>
    </LegalLayout>
  );
}

export function ResponsibleEarningPage() {
  return (
    <LegalLayout title="Responsible Earning" lastUpdated={LAST_UPDATED}>
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
      <p>For full details, please review our <Link to="/withdrawal-policy" className="text-brand-400 font-medium">Withdrawal Policy</Link>.</p>

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
        <Card className="p-5">
          <h3 className="font-bold text-white">General Support</h3>
          <p className="mt-2 text-sm text-ink-400">For account issues, task questions, or referral problems.</p>
          <p className="mt-3 text-sm font-medium text-brand-400">support@zapzo.example</p>
        </Card>
        <Card className="p-5">
          <h3 className="font-bold text-white">Report Fraud</h3>
          <p className="mt-2 text-sm text-ink-400">Report suspicious activity or payment-for-task scams.</p>
          <p className="mt-3 text-sm font-medium text-danger-400">fraud@zapzo.example</p>
        </Card>
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
          { q: 'My withdrawal is taking long', a: 'Withdrawals are manually reviewed. Please allow time for admin processing. If rejected, funds are released back to your wallet. See our Withdrawal Policy for details.' },
          { q: 'My balance seems wrong', a: 'Your available balance excludes pending withdrawals. Check your wallet ledger for a complete transaction history.' },
          { q: 'I was suspended', a: 'Suspensions occur due to fraudulent activity. Contact support if you believe this is an error.' },
        ].map((item) => (
          <Card key={item.q} className="p-4">
            <p className="font-semibold text-white">{item.q}</p>
            <p className="mt-1 text-sm text-ink-400">{item.a}</p>
          </Card>
        ))}
      </div>

      <h2 className="text-xl font-bold text-white">Still Need Help?</h2>
      <p>Visit our <Link to="/contact" className="text-brand-400 font-medium">contact page</Link> to reach our support team.</p>
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
