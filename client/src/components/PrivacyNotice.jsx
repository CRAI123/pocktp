import { useState } from 'react';
import { ShieldCheck, HardDriveDownload, Database, Lock } from 'lucide-react';
import { Button, Modal } from './ui.jsx';

/** 同意记录的本地存储键 —— 仅存浏览器，不上传云端、不与账号关联 */
const ACK_KEY = 'tw_privacy_ack';

/**
 * Cookie 与隐私提示条
 * - 首次访问时在页面底部展示，用户确认后写入 localStorage，不再出现
 * - 同意状态只保存在当前设备，不调用任何后端接口
 */
export default function PrivacyNotice() {
  const [ack, setAck] = useState(() => {
    try { return localStorage.getItem(ACK_KEY) === '1'; } catch { return false; }
  });
  const [showPolicy, setShowPolicy] = useState(false);

  const accept = () => {
    try { localStorage.setItem(ACK_KEY, '1'); } catch { /* 隐私模式等场景写入失败也允许关闭 */ }
    setAck(true);
  };

  if (ack) return null;

  return (
    <>
      <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-2xl sm:inset-x-6 sm:bottom-6">
        <div className="card flex flex-col gap-3 border border-black/5 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
          <div className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-md shadow-blue-500/20">
            <ShieldCheck size={18} />
          </div>
          <p className="flex-1 text-xs leading-relaxed text-ink-secondary sm:text-sm">
            我们使用浏览器本地存储（Cookie / LocalStorage）保存您的登录状态与使用偏好，
            <b className="font-semibold text-ink">这些信息仅保存在您的设备上，不会上传云端</b>
            ，也不使用任何第三方追踪或广告 Cookie。
            <button
              type="button"
              onClick={() => setShowPolicy(true)}
              className="ml-1 font-medium text-[#0071e3] transition hover:underline"
            >
              查看隐私说明
            </button>
          </p>
          <div className="flex shrink-0 justify-end">
            <Button onClick={accept}>我知道了</Button>
          </div>
        </div>
      </div>

      <Modal open={showPolicy} onClose={() => setShowPolicy(false)} title="隐私说明" width="max-w-xl">
        <div className="space-y-4 text-sm leading-relaxed text-ink-secondary">
          <section className="flex gap-3">
            <HardDriveDownload size={18} className="mt-0.5 shrink-0 text-[#0071e3]" />
            <div>
              <h4 className="font-semibold text-ink">本地信息不上传云端</h4>
              <p className="mt-1">
                登录令牌、算力显示、界面偏好以及本隐私条的同意状态，均仅保存在您浏览器的
                LocalStorage / Cookie 中，清除浏览器数据即被删除；我们不会将其上传服务器，
                也不与任何账号关联，不用于跨站追踪。
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#28cd41]" />
            <div>
              <h4 className="font-semibold text-ink">无第三方追踪</h4>
              <p className="mt-1">
                本平台不接入广告 Cookie、行为分析 SDK 或第三方营销脚本，不会因您的访问向外部平台共享浏览行为。
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <Database size={18} className="mt-0.5 shrink-0 text-[#ff9500]" />
            <div>
              <h4 className="font-semibold text-ink">教学数据的存储与隔离</h4>
              <p className="mt-1">
                您主动录入的学生档案、成绩、考勤、待办等业务数据，按教师账号严格隔离，
                存储于受密码与权限保护的云数据库中，仅本人登录后可见，其他教师无法访问。
              </p>
            </div>
          </section>

          <section className="flex gap-3">
            <Lock size={18} className="mt-0.5 shrink-0 text-[#af52de]" />
            <div>
              <h4 className="font-semibold text-ink">联系方式的使用范围</h4>
              <p className="mt-1">
                家长电话、微信等联系方式仅用于本班教学与家校沟通，我们不会向任何第三方出售、出租或共享。
              </p>
            </div>
          </section>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={() => { setShowPolicy(false); accept(); }}>我知道了</Button>
        </div>
      </Modal>
    </>
  );
}
