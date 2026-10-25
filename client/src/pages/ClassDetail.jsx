import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Users, LayoutGrid, SprayCan, Award, Phone, Star, Wallet, Presentation,
  Gift, FileText, MessageSquare, NotebookPen, ScrollText, BookX, Archive, DatabaseBackup,
} from 'lucide-react';
import { api } from '../api.js';
import { Badge } from '../components/ui.jsx';
import { exportClassArchive } from './class/archiveExport.js';
import SeatsTab from './class/SeatsTab.jsx';
import DutyTab from './class/DutyTab.jsx';
import CommitteeTab from './class/CommitteeTab.jsx';
import ParentsTab from './class/ParentsTab.jsx';
import MoralTab from './class/MoralTab.jsx';
import FundsTab from './class/FundsTab.jsx';
import MeetingsTab from './class/MeetingsTab.jsx';
import RewardsTab from './class/RewardsTab.jsx';
import LeaveTab from './class/LeaveTab.jsx';
import TalksTab from './class/TalksTab.jsx';
import LogsTab from './class/LogsTab.jsx';
import CertificatesTab from './class/CertificatesTab.jsx';
import WrongBookTab from './class/WrongBookTab.jsx';
import BackupsTab from './class/BackupsTab.jsx';

const TABS = [
  { key: 'seats', label: '座次表', icon: LayoutGrid },
  { key: 'duty', label: '值日表', icon: SprayCan },
  { key: 'committee', label: '班委', icon: Award },
  { key: 'parents', label: '家长联系', icon: Phone },
  { key: 'moral', label: '德育量化', icon: Star },
  { key: 'wrongbook', label: '错题本', icon: BookX },
  { key: 'rewards', label: '奖励兑换', icon: Gift },
  { key: 'leave', label: '请假条', icon: FileText },
  { key: 'talks', label: '谈话记录', icon: MessageSquare },
  { key: 'logs', label: '班级日志', icon: NotebookPen },
  { key: 'certificates', label: '电子奖状', icon: ScrollText },
  { key: 'funds', label: '班费台账', icon: Wallet },
  { key: 'meetings', label: '班会记录', icon: Presentation },
  { key: 'backups', label: '数据备份', icon: DatabaseBackup },
];

export default function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'seats';
  const [cls, setCls] = useState(null);
  const [err, setErr] = useState('');
  const [archiving, setArchiving] = useState(false);

  /** 整班归档：把该班资料打包成一个多工作表 Excel */
  const doArchive = async () => {
    setArchiving(true);
    try {
      await exportClassArchive(id, cls?.name || '班级');
    } catch (e) {
      alert(`归档导出失败：${e.message || '请稍后重试'}`);
    } finally {
      setArchiving(false);
    }
  };

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

  const TabComp = {
    seats: SeatsTab, duty: DutyTab, committee: CommitteeTab, parents: ParentsTab, moral: MoralTab,
    rewards: RewardsTab, leave: LeaveTab, talks: TalksTab, logs: LogsTab, certificates: CertificatesTab,
    wrongbook: WrongBookTab,
    funds: FundsTab, meetings: MeetingsTab, backups: BackupsTab,
  }[tab];

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
        <button
          onClick={doArchive}
          disabled={archiving}
          title="把学生名单、成绩、考勤、德育、班费、班会、日志、请假、错题打包成一个 Excel"
          className="btn-pill ml-auto flex items-center gap-1.5 border border-black/[0.08] bg-white/70 px-3.5 py-2 text-sm font-medium text-ink-secondary shadow-sm transition hover:bg-white hover:text-ink disabled:opacity-60"
        >
          <Archive size={15} />{archiving ? '打包中…' : '整班归档'}
        </button>
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
