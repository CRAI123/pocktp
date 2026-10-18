import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Users, LayoutGrid, SprayCan, Award, Phone, Star, Wallet, Presentation,
} from 'lucide-react';
import { api } from '../api.js';
import { Badge } from '../components/ui.jsx';
import SeatsTab from './class/SeatsTab.jsx';
import DutyTab from './class/DutyTab.jsx';
import CommitteeTab from './class/CommitteeTab.jsx';
import ParentsTab from './class/ParentsTab.jsx';
import MoralTab from './class/MoralTab.jsx';
import FundsTab from './class/FundsTab.jsx';
import MeetingsTab from './class/MeetingsTab.jsx';

const TABS = [
  { key: 'seats', label: '座次表', icon: LayoutGrid },
  { key: 'duty', label: '值日表', icon: SprayCan },
  { key: 'committee', label: '班委', icon: Award },
  { key: 'parents', label: '家长联系', icon: Phone },
  { key: 'moral', label: '德育量化', icon: Star },
  { key: 'funds', label: '班费台账', icon: Wallet },
  { key: 'meetings', label: '班会记录', icon: Presentation },
];

export default function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'seats';
  const [cls, setCls] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/classes')
      .then(list => {
        const found = list.find(c => String(c.id) === String(id));
        if (!found) setErr('班级不存在或无权访问');
        else setCls(found);
      })
      .catch(e => setErr(e.message));
  }, [id]);

  if (err) return (
    <div className="card p-10 text-center text-sm text-ink-secondary">
      {err}，<Link to="/" className="text-[#0071e3] hover:underline">返回工作台</Link>
    </div>
  );
  if (!cls) return <div className="card animate-pulse p-10 text-center text-sm text-ink-secondary">加载中…</div>;

  const TabComp = { seats: SeatsTab, duty: DutyTab, committee: CommitteeTab, parents: ParentsTab, moral: MoralTab, funds: FundsTab, meetings: MeetingsTab }[tab];

  return (
    <div className="space-y-5">
      {/* 班级信息头 */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/')} className="btn-pill p-2 text-ink-secondary hover:bg-black/5" title="返回">
          <ArrowLeft size={18} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{cls.name}</h2>
            <Badge tone="blue">{cls.grade}</Badge>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-secondary">
            <Users size={12} />{cls.student_count} 名学生{cls.description ? ` · ${cls.description}` : ''}
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSp({ tab: t.key }, { replace: true })}
            className={`btn-pill flex shrink-0 items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition ${
              tab === t.key ? 'brand-gradient text-white shadow-md shadow-blue-500/25' : 'bg-black/[0.04] text-ink-secondary hover:bg-black/[0.07] hover:text-ink'
            }`}
          >
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      <TabComp classId={id} />
    </div>
  );
}
