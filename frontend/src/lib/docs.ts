import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const getDocsDirectory = () => {
  // In development, process.cwd() is frontend/
  // In production (Docker), process.cwd() is /app and docs is mounted at /app/docs
console.log("cwd =", process.cwd());  

const devPath = path.join(process.cwd(), '../docs/user-guide');
const prodPath = path.join(process.cwd(), 'docs/user-guide');
 

console.log("devPath =", devPath);
console.log("devExists =", fs.existsSync(devPath));

console.log("prodPath =", prodPath);
console.log("prodExists =", fs.existsSync(prodPath));

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

  console.log("slug =", slug);

  const fullPath = path.join(docsDirectory, `${slug}.md`);

  console.log("fullPath =", fullPath);
  console.log("fileExists =", fs.existsSync(fullPath));

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


