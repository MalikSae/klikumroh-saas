import React from 'react';
import { Search, Filter, Calendar, CheckCircle2, Copy, FileText, ArrowRightLeft, MessageCircle, Share2, Download, LogIn } from 'lucide-react';
import '../pages/AgentDetail.css';

interface ActivityItem {
  id: string;
  type: 'add_prospect' | 'copy_script' | 'open_source' | 'copy_content' | 'change_stage' | 'open_wa' | 'share_package' | 'download_media' | 'login';
  action: string;
  object?: string;
  channel?: string;
  time: string;
}

interface ActivityGroup {
  label: string;
  items: ActivityItem[];
}

const dummyData: ActivityGroup[] = [
  {
    label: 'Hari ini',
    items: [
      { id: '1', type: 'add_prospect', action: 'Menambah prospek baru', object: 'Ahmad Muzakki', channel: 'via Form Publik', time: '10:42 WIB' },
      { id: '2', type: 'copy_script', action: 'Menyalin Script', object: 'Follow Up Hari 1', channel: 'dari Koleksi Script', time: '10:40 WIB' }
    ]
  },
  {
    label: 'Kemarin',
    items: [
      { id: '3', type: 'open_source', action: 'Membuka Sumber', object: 'Facebook Ads', channel: 'di Kampanye Ramadhan', time: '14:20 WIB' },
      { id: '4', type: 'copy_content', action: 'Menyalin Konten', object: 'Brosur Paket Itikaf', channel: 'dari Galeri', time: '14:15 WIB' },
      { id: '5', type: 'change_stage', action: 'Memindahkan status prospek', object: 'Siti Aminah', channel: 'ke "Tertarik"', time: '13:05 WIB' },
      { id: '6', type: 'open_wa', action: 'Membuka chat WhatsApp', object: 'Siti Aminah', channel: '', time: '13:02 WIB' }
    ]
  },
  {
    label: '12–13 Maret',
    items: [
      { id: '7', type: 'share_package', action: 'Membagikan Paket', object: 'Umroh Plus Turki', channel: 'ke WhatsApp', time: '12 Mar, 09:15 WIB' },
      { id: '8', type: 'download_media', action: 'Mengunduh Media', object: 'Video Testimoni', channel: 'dari Galeri', time: '12 Mar, 09:10 WIB' },
      { id: '9', type: 'login', action: 'Login ke Portal Agen', channel: 'via Web', time: '12 Mar, 08:30 WIB' }
    ]
  }
];

export const AgentActivityFeed: React.FC = () => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'add_prospect': return <CheckCircle2 size={20} />;
      case 'copy_script': return <Copy size={20} />;
      case 'open_source': return <FileText size={20} />;
      case 'copy_content': return <Copy size={20} />;
      case 'change_stage': return <ArrowRightLeft size={20} />;
      case 'open_wa': return <MessageCircle size={20} />;
      case 'share_package': return <Share2 size={20} />;
      case 'download_media': return <Download size={20} />;
      case 'login': return <LogIn size={20} />;
      default: return <FileText size={20} />;
    }
  };

  const getIconClass = (type: string) => {
    switch (type) {
      case 'add_prospect': return 'add';
      case 'copy_script':
      case 'copy_content': return 'copy';
      case 'open_source': return 'open';
      case 'change_stage': return 'change';
      case 'open_wa': return 'whatsapp';
      case 'share_package': return 'share';
      case 'download_media': return 'download';
      case 'login': return 'login';
      default: return '';
    }
  };

  return (
    <div className="adv2-activity-panel">
      {/* Toolbar */}
      <div className="adv2-feed-toolbar">
        <div className="adv2-feed-filters">
          <div className="adv2-feed-search">
            <Search size={16} color="var(--db-text-muted)" />
            <input type="text" placeholder="Cari aktivitas..." />
          </div>
          <button className="adv2-feed-filter-btn">
            <Filter size={16} />
            <span>Semua Tipe</span>
          </button>
          <button className="adv2-feed-filter-btn">
            <Calendar size={16} />
            <span>Semua Tanggal</span>
          </button>
        </div>
        <div className="adv2-feed-count">
          Menampilkan 50 aktivitas terakhir
        </div>
      </div>

      {/* Feed Body */}
      <div className="adv2-feed-body">
        {dummyData.map((group, gIdx) => (
          <div key={gIdx} className="adv2-feed-group">
            <div className="adv2-feed-group-label">{group.label}</div>
            {group.items.map((item) => (
              <div key={item.id} className="adv2-feed-row">
                <div className={`adv2-feed-icon-box ${getIconClass(item.type)}`}>
                  {getIcon(item.type)}
                </div>
                <div className="adv2-feed-content">
                  <div className="adv2-feed-text">
                    {item.action} {item.object && <strong>{item.object}</strong>}
                  </div>
                  <div className="adv2-feed-meta">
                    {item.channel && <span>{item.channel}</span>}
                    {item.channel && <div className="adv2-feed-meta-dot" />}
                    <span>{item.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
