import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const junior = defineCollection({
  loader: glob({ pattern: '*/index.md', base: 'src/content/junior' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number(),
    cover: z.string().optional(),
    publishDate: z.string(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const senior = defineCollection({
  loader: glob({ pattern: '*/index.md', base: 'src/content/senior' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number(),
    cover: z.string().optional(),
    publishDate: z.string(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { junior, senior };
