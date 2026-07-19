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

export interface DocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface DocPage extends DocEntry {
  content: string;
  headings: DocHeading[];
}

export const docsNavigation: Array<{
  label: string;
  slug: string;
  items: Array<Omit<DocEntry, 'groupLabel'>>;
}> = [
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
      { slug: 'server-management/servers', title: 'Server và truy cập từ xa', description: 'Thông tin hệ thống, dịch vụ, Docker và Web Terminal.', group: 'server-management', order: 50 },
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

const flatNavigation: DocEntry[] = docsNavigation
  .flatMap((group) => group.items.map((item) => ({ ...item, groupLabel: group.label })))
  .sort((a, b) => a.order - b.order);

function getDocsDirectory() {
  const candidates = [
    path.join(process.cwd(), '../docs/public'),
    path.join(process.cwd(), 'docs/public'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function safeSlug(parts: string[]) {
  const slug = parts.join('/');
  if (!/^[a-z0-9][a-z0-9/-]*$/.test(slug) || slug.includes('..')) return null;
  return slug;
}

export function getAllDocs(): DocEntry[] {
  const docsDirectory = getDocsDirectory();
  return flatNavigation.map((entry) => {
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

export function getDocBySlug(parts: string[]): DocPage | null {
  const slug = safeSlug(parts);
  if (!slug) return null;
  const catalogEntry = flatNavigation.find((entry) => entry.slug === slug);
  if (!catalogEntry) return null;

  const docsDirectory = getDocsDirectory();
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

export function getAdjacentDocs(slug: string) {
  const index = flatNavigation.findIndex((entry) => entry.slug === slug);
  return {
    previous: index > 0 ? flatNavigation[index - 1] : null,
    next: index >= 0 && index < flatNavigation.length - 1 ? flatNavigation[index + 1] : null,
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
