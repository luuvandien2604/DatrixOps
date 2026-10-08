import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export interface DocEntry {
  slug: string;
  title: string;
  description: string;
  group: string;
  groupLabel: string;
  order: number;
  searchText?: string;
}

export type DocLocale = 'vi' | 'en';

export interface DocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface DocPage extends DocEntry {
  content: string;
  headings: DocHeading[];
}

export type DocsNavigation = Array<{
  label: string;
  slug: string;
  items: Array<Omit<DocEntry, 'groupLabel'>>;
}>;

const viNavigation: DocsNavigation = [
  {
    label: 'Giới thiệu',
    slug: 'introduction',
    items: [
      { slug: 'introduction/overview', title: 'Tổng quan & Khả năng', description: 'DatrixOps là gì, các nền tảng hỗ trợ và mô hình hoạt động.', group: 'introduction', order: 10 },
    ],
  },
  {
    label: 'Bắt đầu nhanh',
    slug: 'getting-started',
    items: [
      { slug: 'getting-started/quickstart', title: 'Cài đặt nhanh máy chủ DatrixOps', description: 'Khởi chạy DatrixOps với Docker Compose và cấu hình tài khoản quản trị ban đầu.', group: 'getting-started', order: 20 },
      { slug: 'getting-started/add-server', title: 'Thêm máy chủ cần giám sát', description: 'Tạo mã Agent Token và cài đặt Agent 1 dòng lệnh trên Linux, macOS, Windows.', group: 'getting-started', order: 25 },
    ],
  },
  {
    label: 'Tính năng',
    slug: 'features',
    items: [
      { slug: 'features/servers', title: 'Giám sát máy chủ & Dịch vụ', description: 'Theo dõi chỉ số CPU, RAM, ổ đĩa, mạng, dịch vụ hệ thống và container Docker.', group: 'features', order: 30 },
      { slug: 'features/network-quality', title: 'Chẩn đoán chất lượng mạng', description: 'Đo lường độ trễ ICMP/TCP, Gateway uplink, phân nhóm thẻ và tỷ lệ mất gói.', group: 'features', order: 32 },
      { slug: 'features/uptime', title: 'Giám sát Website & SSL', description: 'Kiểm tra Uptime website, mã HTTP, thời gian phản hồi và hạn chứng chỉ SSL.', group: 'features', order: 34 },
      { slug: 'features/alerts', title: 'Cảnh báo & Kênh thông báo', description: 'Cấu hình ngưỡng cảnh báo tự động gửi qua Telegram, Discord, Email và Webhook.', group: 'features', order: 36 },
      { slug: 'features/web-terminal', title: 'Web Terminal từ xa', description: 'Truy cập shell dòng lệnh an toàn trực tiếp từ trình duyệt qua WebSocket đảo chiều.', group: 'features', order: 38 },
      { slug: 'features/cron-monitoring', title: 'Giám sát tác vụ Cron', description: 'Theo dõi lịch sử chạy, thời gian thực thi và mã thoát lỗi của Cron job.', group: 'features', order: 40 },
    ],
  },
  {
    label: 'Hướng dẫn',
    slug: 'guides',
    items: [
      { slug: 'guides/agent-updates', title: 'Cập nhật phiên bản Agent', description: 'Nâng cấp Agent tự động từ Dashboard hoặc bằng lệnh thủ công.', group: 'guides', order: 50 },
      { slug: 'guides/uninstall-server', title: 'Gỡ bỏ Agent & Xóa máy chủ', description: 'Gỡ bỏ Agent an toàn, dọn dẹp tiến trình và xóa máy chủ khỏi Dashboard.', group: 'guides', order: 52 },
      { slug: 'guides/backup-restore', title: 'Sao lưu & Khôi phục dữ liệu', description: 'Sao lưu dữ liệu SQLite, cấu hình hệ thống và di chuyển sang máy chủ mới.', group: 'guides', order: 54 },
    ],
  },
  {
    label: 'Tham chiếu',
    slug: 'reference',
    items: [
      { slug: 'reference/cli', title: 'Lệnh CLI datrix', description: 'Danh mục các lệnh kiểm tra, khởi động, dừng và gỡ lỗi Agent.', group: 'reference', order: 60 },
      { slug: 'reference/configuration', title: 'Biến môi trường .env', description: 'Bảng tham chiếu đầy đủ các biến môi trường của máy chủ DatrixOps.', group: 'reference', order: 62 },
    ],
  },
  {
    label: 'Xử lý sự cố & FAQ',
    slug: 'troubleshooting',
    items: [
      { slug: 'troubleshooting/common-issues', title: 'Xử lý sự cố thường gặp', description: 'Khắc phục lỗi Agent offline, lỗi kết nối mạng, terminal và cấp phát chứng chỉ.', group: 'troubleshooting', order: 70 },
      { slug: 'troubleshooting/faq', title: 'Câu hỏi thường gặp', description: 'Giải đáp các thắc mắc về tài nguyên, cổng mạng, lưu trữ và bảo mật.', group: 'troubleshooting', order: 72 },
    ],
  },
];

const enNavigation: DocsNavigation = [
  {
    label: 'Introduction',
    slug: 'introduction',
    items: [
      { slug: 'introduction/overview', title: 'Overview & Capabilities', description: 'What is DatrixOps, supported platforms, and how the platform works.', group: 'introduction', order: 10 },
    ],
  },
  {
    label: 'Getting started',
    slug: 'getting-started',
    items: [
      { slug: 'getting-started/quickstart', title: 'Quickstart Deployment', description: 'Deploy DatrixOps using Docker Compose and complete initial administrator setup.', group: 'getting-started', order: 20 },
      { slug: 'getting-started/add-server', title: 'Adding Monitored Servers', description: 'Generate Agent Tokens and install the Agent on Linux, macOS, and Windows with one command.', group: 'getting-started', order: 25 },
    ],
  },
  {
    label: 'Features',
    slug: 'features',
    items: [
      { slug: 'features/servers', title: 'Server & Resource Monitoring', description: 'Real-time CPU, RAM, disk, network metrics, system services, and Docker containers.', group: 'features', order: 30 },
      { slug: 'features/network-quality', title: 'Network Quality Diagnostics', description: 'Measure ICMP/TCP latency, Gateway uplink, dynamic tag targets, and packet loss.', group: 'features', order: 32 },
      { slug: 'features/uptime', title: 'Website & SSL Monitoring', description: 'Track website uptime, HTTP response codes, latency, and SSL certificate expiration.', group: 'features', order: 34 },
      { slug: 'features/alerts', title: 'Alerts & Notifications', description: 'Set up incident alert rules with dispatch to Telegram, Discord, Email, and Webhooks.', group: 'features', order: 36 },
      { slug: 'features/web-terminal', title: 'Remote Web Terminal', description: 'Securely open a browser-based shell via reverse WebSocket without open inbound ports.', group: 'features', order: 38 },
      { slug: 'features/cron-monitoring', title: 'Cron Execution Telemetry', description: 'Record real cron job run times, exit codes, and execution history with the agent wrapper.', group: 'features', order: 40 },
    ],
  },
  {
    label: 'Guides',
    slug: 'guides',
    items: [
      { slug: 'guides/agent-updates', title: 'Updating the Agent', description: 'Upgrade agents automatically from the Dashboard or manually with CLI commands.', group: 'guides', order: 50 },
      { slug: 'guides/uninstall-server', title: 'Uninstalling & Removing Servers', description: 'Safely uninstall the agent, clean up background services, and remove servers from Dashboard.', group: 'guides', order: 52 },
      { slug: 'guides/backup-restore', title: 'Backup & Disaster Recovery', description: 'Back up SQLite data and configuration, and restore them to a new host.', group: 'guides', order: 54 },
    ],
  },
  {
    label: 'Reference',
    slug: 'reference',
    items: [
      { slug: 'reference/cli', title: 'The datrix CLI', description: 'Command-line options for running, testing, stopping, and debugging the agent.', group: 'reference', order: 60 },
      { slug: 'reference/configuration', title: 'Environment Variables (.env)', description: 'Complete reference for DatrixOps server configuration and environment settings.', group: 'reference', order: 62 },
    ],
  },
  {
    label: 'Troubleshooting & FAQ',
    slug: 'troubleshooting',
    items: [
      { slug: 'troubleshooting/common-issues', title: 'Common Issues & Solutions', description: 'Diagnose offline agents, network probe errors, web terminal timeouts, and SSL renewal.', group: 'troubleshooting', order: 70 },
      { slug: 'troubleshooting/faq', title: 'Frequently Asked Questions', description: 'Common questions about hardware overhead, firewall ports, storage, and security.', group: 'troubleshooting', order: 72 },
    ],
  },
];

export const docsNavigationByLocale: Record<DocLocale, DocsNavigation> = {
  vi: viNavigation,
  en: enNavigation,
};

export const docsNavigation = viNavigation;

function flatNavigation(locale: DocLocale): DocEntry[] {
  return docsNavigationByLocale[locale]
    .flatMap((group) => group.items.map((item) => ({ ...item, groupLabel: group.label })))
    .sort((a, b) => a.order - b.order);
}

function getDocsDirectory(locale: DocLocale) {
  const root = path.join(process.cwd(), 'docs/public');
  return locale === 'en' ? path.join(root, 'en') : root;
}

function safeSlug(parts: string[]) {
  const slug = parts.join('/');
  if (!/^[a-z0-9][a-z0-9/-]*$/.test(slug) || slug.includes('..')) return null;
  return slug;
}

export function getAllDocs(locale: DocLocale = 'vi'): DocEntry[] {
  const docsDirectory = getDocsDirectory(locale);
  return flatNavigation(locale).map((entry) => {
    const filePath = path.join(docsDirectory, `${entry.slug}.md`);
    if (!fs.existsSync(filePath)) return entry;
    const { content } = matter(fs.readFileSync(filePath, 'utf8'));
    return {
      ...entry,
      searchText: content
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    };
  });
}

export function getDocBySlug(parts: string[], locale: DocLocale = 'vi'): DocPage | null {
  const slug = safeSlug(parts);
  if (!slug) return null;
  const catalogEntry = flatNavigation(locale).find((entry) => entry.slug === slug);
  if (!catalogEntry) return null;

  const docsDirectory = getDocsDirectory(locale);
  const filePath = path.join(docsDirectory, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const { data, content } = matter(fs.readFileSync(filePath, 'utf8'));
  return {
    ...catalogEntry,
    title: String(data.title || catalogEntry.title),
    description: String(data.description || catalogEntry.description),
    content,
    headings: extractHeadings(content),
  };
}

export function getAdjacentDocs(slug: string, locale: DocLocale = 'vi') {
  const entries = flatNavigation(locale);
  const index = entries.findIndex((entry) => entry.slug === slug);
  return {
    previous: index > 0 ? entries[index - 1] : null,
    next: index >= 0 && index < entries.length - 1 ? entries[index + 1] : null,
  };
}

export function slugifyHeading(value: string) {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/`|\*\*|__|\[|\]|\(|\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractHeadings(content: string): DocHeading[] {
  return content
    .split('\n')
    .map((line) => {
      const match = /^(##|###)\s+(.+)$/.exec(line.trim());
      if (!match) return null;
      const text = match[2].replace(/[*_`[\]]/g, '').replace(/\(([^)]+)\)/g, '').trim();
      return { id: slugifyHeading(text), text, level: match[1].length as 2 | 3 };
    })
    .filter((heading): heading is DocHeading => heading !== null);
}
