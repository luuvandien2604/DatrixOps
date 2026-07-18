import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const getDocsDirectory = () => {
  // In development, process.cwd() is frontend/
  // In production (Docker), process.cwd() is /app and docs is mounted at /app/docs
  const devPath = path.join(process.cwd(), '../docs/user-guide');
  const prodPath = path.join(process.cwd(), 'docs/user-guide');

  if (fs.existsSync(devPath)) {
    return devPath;
  }
  return prodPath;
};

export interface DocMeta {
  slug: string;
  title: string;
  description?: string;
  role: string;
  order: number;
}

export function getAllDocs(): DocMeta[] {
  const docsDirectory = getDocsDirectory();
  if (!fs.existsSync(docsDirectory)) {
      return [];
  }
  const fileNames = fs.readdirSync(docsDirectory);
  
  const docs = fileNames
    .filter(fileName => fileName.endsWith('.md'))
    .map(fileName => {
      const slug = fileName.replace(/\.md$/, '');
      const fullPath = path.join(docsDirectory, fileName);
      const fileContents = fs.readFileSync(fullPath, 'utf8');
      
      const { data } = matter(fileContents);
      
      return {
        slug,
        title: data.title || slug,
        description: data.description || '',
        role: data.role || 'public',
        order: data.order || 99,
      };
    });
    
  return docs.sort((a, b) => a.order - b.order);
}

export function getDocBySlug(slug: string) {
  const docsDirectory = getDocsDirectory();
  const fullPath = path.join(docsDirectory, `${slug}.md`);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(fullPath, 'utf8');
  const { data, content } = matter(fileContents);

  return {
    meta: {
      slug,
      title: data.title || slug,
      description: data.description || '',
      role: data.role || 'public',
      order: data.order || 99,
    },
    content,
  };
}

