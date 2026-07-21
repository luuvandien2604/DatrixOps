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
      { slug: 'introduction/what-is-datrixops', title: 'DatrixOps là gì?', description: 'Kiến trúc, thành phần và yêu cầu hệ thống.', group: 'introduction', order: 10 },
    ],
  },
  {
    label: 'Bắt đầu',
    slug: 'getting-started',
    items: [
      { slug: 'getting-started/account-and-first-server', title: 'Tài khoản và server đầu tiên', description: 'Đăng nhập, tạo server và bảo vệ Agent Token.', group: 'getting-started', order: 20 },
      { slug: 'getting-started/installation', title: 'Cài đặt Agent', description: 'Cài Agent trên Linux, macOS và Windows.', group: 'getting-started', order: 30 },
    ],
  },
  {
    label: 'Dashboard',
    slug: 'dashboard',
    items: [
      { slug: 'dashboard/overview', title: 'Đọc Dashboard', description: 'Trạng thái và các chỉ số CPU, RAM, disk, network.', group: 'dashboard', order: 40 },
    ],
  },
  {
    label: 'Quản lý server',
    slug: 'server-management',
    items: [
      { slug: 'server-management/servers', title: 'Quản lý server', description: 'Metadata, thông tin hệ thống, dịch vụ và Docker.', group: 'server-management', order: 50 },
      { slug: 'server-management/web-terminal', title: 'Web Terminal', description: 'Mở shell Linux headless qua reverse WebSocket an toàn.', group: 'server-management', order: 51 },
      { slug: 'server-management/delete-server', title: 'Gỡ Agent và xóa server', description: 'Gỡ Agent Linux từ xa, theo dõi trạng thái và force delete.', group: 'server-management', order: 52 },
    ],
  },
  {
    label: 'Quản lý Agent',
    slug: 'agent-management',
    items: [
      { slug: 'agent-management/updates', title: 'Phiên bản và cập nhật', description: 'Self-update, Update all agents và xử lý lỗi.', group: 'agent-management', order: 60 },
    ],
  },
  {
    label: 'Bảo mật',
    slug: 'security',
    items: [
      { slug: 'security/agent-and-updates', title: 'Kết nối và signed updates', description: 'Agent Token, TLS, Ed25519 và SHA-256.', group: 'security', order: 70 },
    ],
  },
  {
    label: 'Trợ giúp',
    slug: 'help',
    items: [
      { slug: 'troubleshooting/common-issues', title: 'Xử lý sự cố', description: 'Chẩn đoán Agent offline, update, quyền và network.', group: 'help', order: 80 },
      { slug: 'faq', title: 'Câu hỏi thường gặp', description: 'Câu trả lời theo đúng khả năng hiện tại của DatrixOps.', group: 'help', order: 90 },
    ],
  },
];

const enNavigation: DocsNavigation = [
  {
    label: 'Introduction',
    slug: 'introduction',
    items: [
      { slug: 'introduction/what-is-datrixops', title: 'What is DatrixOps?', description: 'Architecture, components, supported platforms, and requirements.', group: 'introduction', order: 10 },
    ],
  },
  {
    label: 'Getting started',
    slug: 'getting-started',
    items: [
      { slug: 'getting-started/account-and-first-server', title: 'Account and first server', description: 'Sign in, register a server, and protect its Agent Token.', group: 'getting-started', order: 20 },
      { slug: 'getting-started/installation', title: 'Install the Agent', description: 'Install the Agent on Linux, macOS, and Windows.', group: 'getting-started', order: 30 },
    ],
  },
  {
    label: 'Dashboard',
    slug: 'dashboard',
    items: [
      { slug: 'dashboard/overview', title: 'Read the Dashboard', description: 'Understand server state, CPU, memory, disk, and network.', group: 'dashboard', order: 40 },
    ],
  },
  {
    label: 'Server management',
    slug: 'server-management',
    items: [
      { slug: 'server-management/servers', title: 'Servers and remote access', description: 'System information, services, Docker, and Web Terminal.', group: 'server-management', order: 50 },
    ],
  },
  {
    label: 'Agent management',
    slug: 'agent-management',
    items: [
      { slug: 'agent-management/updates', title: 'Versions and updates', description: 'Self-update, Update all agents, and failure handling.', group: 'agent-management', order: 60 },
    ],
  },
  {
    label: 'Security',
    slug: 'security',
    items: [
      { slug: 'security/agent-and-updates', title: 'Connections and signed updates', description: 'Agent Tokens, TLS, Ed25519, and SHA-256.', group: 'security', order: 70 },
    ],
  },
  {
    label: 'Help',
    slug: 'help',
    items: [
      { slug: 'troubleshooting/common-issues', title: 'Troubleshooting', description: 'Diagnose offline Agents, updates, permissions, and networking.', group: 'help', order: 80 },
      { slug: 'faq', title: 'Frequently asked questions', description: 'Answers based on capabilities implemented in DatrixOps today.', group: 'help', order: 90 },
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
  const candidates = [
    path.join(process.cwd(), '../docs/public'),
    path.join(process.cwd(), 'docs/public'),
  ];
  const root = candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
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
