import { motion } from 'framer-motion';
import { CountUp } from '../../components/CountUp/CountUp';
import { Notice } from '../../components/Notice/Notice';
import { Skeleton } from '../../components/Skeleton/Skeleton';
import type { Overview } from '../../features/admin/api';
import { useAdminData } from '../../features/admin/useAdminData';
import { formatMoney } from '../../lib/money';
import { riseItem, staggerParent } from '../../lib/motion';

const COUNT_LABELS: Record<string, string> = {
  profiles: 'Accounts',
  mentors: 'Mentors',
  opportunities: 'Opportunities',
  universities: 'Universities',
  courses: 'Courses',
  applications: 'Applications',
};

export default function AdminOverview() {
  const { data, error } = useAdminData<Overview>('overview');

  return (
    <section className="admin-section" aria-labelledby="ov-h">
      <div className="admin-section__head">
        <h1 id="ov-h" className="admin-section__title">
          Overview
        </h1>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!data && !error && <Skeleton shape="block" height="200px" label="Loading overview" />}
      {data && (
        <>
          {data.refunds_needed > 0 && (
            <Notice tone="error">
              {data.refunds_needed} paid {data.refunds_needed === 1 ? 'booking needs' : 'bookings need'} a refund (slot taken while paying). Refund in the Paystack dashboard; these are excluded from revenue.
            </Notice>
          )}
          {data.warnings.map((w) => (
            <Notice key={w} tone="info">
              {w}
            </Notice>
          ))}
          <motion.div className="stat-grid" variants={staggerParent} initial="hidden" animate="show">
            <motion.div className="stat" variants={riseItem}>
              <span className="stat__label">Active Pro students</span>
              <span className="stat__value"><CountUp value={data.active_pro} /></span>
            </motion.div>
            <motion.div className="stat" variants={riseItem} data-alert={data.pending_mentors > 0 || undefined}>
              <span className="stat__label">Mentors awaiting review</span>
              <span className="stat__value"><CountUp value={data.pending_mentors} /></span>
            </motion.div>
            <motion.div className="stat" variants={riseItem} data-alert={data.rates_pending > 0 || undefined}>
              <span className="stat__label">Mentor rates to approve</span>
              <span className="stat__value"><CountUp value={data.rates_pending} /></span>
            </motion.div>
            <motion.div className="stat" variants={riseItem}>
              <span className="stat__label">Applications in progress</span>
              <span className="stat__value"><CountUp value={data.open_applications} /></span>
            </motion.div>
            {Object.entries(data.counts).map(([k, v]) => (
              <motion.div key={k} className="stat" variants={riseItem}>
                <span className="stat__label">{COUNT_LABELS[k] ?? k}</span>
                <span className="stat__value"><CountUp value={v} /></span>
              </motion.div>
            ))}
          </motion.div>

          <section className="admin-section" aria-labelledby="rev-h">
            <h2 id="rev-h" className="admin-section__title">
              Revenue
            </h2>
            <p className="admin-section__sub">All payments are in GHS. Mentor payouts settle to each mentor's subaccount and are not Afriversity revenue.</p>
            {data.revenue.length === 0 ? (
              <Notice tone="info">No successful payments yet.</Notice>
            ) : (
              <div className="table-scroll">
                <table className="revenue-table">
                  <thead>
                    <tr>
                      <th scope="col">Currency</th>
                      <th scope="col">Pro subscriptions</th>
                      <th scope="col">Application fees</th>
                      <th scope="col">Mentor commission (25%)</th>
                      <th scope="col">Afriversity net</th>
                      <th scope="col">Mentor payouts (75%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenue.map((r) => (
                      <tr key={r.currency}>
                        <th scope="row">{r.currency}</th>
                        <td>{formatMoney(r.subscriptions_revenue, r.currency)}</td>
                        <td>{formatMoney(r.application_fees_collected, r.currency)}</td>
                        <td>{formatMoney(r.mentor_commission, r.currency)}</td>
                        <td className="revenue-table__net">
                          <CountUp value={r.net_revenue} format={(n) => formatMoney(Math.round(n), r.currency)} />
                        </td>
                        <td>{formatMoney(r.mentor_payouts, r.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
