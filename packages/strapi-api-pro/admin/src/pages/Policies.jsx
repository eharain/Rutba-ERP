import React from 'react';
import { Box, Typography, Textarea, Flex } from '@strapi/design-system';

const SAMPLE_CONTEXT = {
  strapi: { request: { method: 'GET', path: '/cms-footers/123' } },
  user: { id: 9, email: 'user@example.com' },
  claim: { appName: 'web-user', roleKey: 'web_user', domainKey: 'web-authenticated' },
  input: { id: '123', fields: ['title'], populate: { links: true } },
};

const TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function getByPath(obj, path) {
  return path.split('.').reduce((acc, seg) => (acc && typeof acc === 'object' ? acc[seg] : undefined), obj);
}

function resolvePreview(raw) {
  if (!raw.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Invalid JSON' };
  }

  const walk = (node) => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) out[k] = walk(v);
      return out;
    }
    if (typeof node === 'string') {
      return node.replace(TOKEN_REGEX, (_, token) => {
        const value = getByPath(SAMPLE_CONTEXT, token);
        if (value == null) return '';
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      });
    }
    return node;
  };

  return walk(parsed);
}

const Policies = () => {
  const [template, setTemplate] = React.useState(
    JSON.stringify(
      {
        filters: { id: '{{input.id}}', owner: '{{user.id}}', app: '{{claim.appName}}' },
        populate: '{{input.populate}}',
        body: { updatedBy: '{{user.email}}', route: '{{strapi.request.path}}' },
      },
      null,
      2
    )
  );

  const preview = React.useMemo(() => resolvePreview(template), [template]);

  return (
    <Box padding={6}>
      <Typography variant="beta">Method Policies</Typography>
      <Typography variant="omega">Template variables: strapi.*, user.*, claim.*, input.*</Typography>

      <Flex gap={4} wrap="wrap" paddingTop={4} alignItems="flex-start">
        <Box style={{ flex: '1 1 420px', minWidth: 320 }}>
          <Textarea
            label="Policy Template JSON"
            name="policy-template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="Enter template JSON"
          />
        </Box>
        <Box style={{ flex: '1 1 420px', minWidth: 320 }}>
          <Typography variant="sigma">Resolved Preview (sample context)</Typography>
          <pre>{JSON.stringify(preview, null, 2)}</pre>
        </Box>
      </Flex>

      <Box paddingTop={3}>
        <Typography variant="pi">Quick tokens: {'{{input.id}}'}, {'{{input.fields}}'}, {'{{input.populate}}'}, {'{{claim.roleKey}}'}, {'{{user.id}}'}, {'{{strapi.request.path}}'}</Typography>
      </Box>
    </Box>
  );
};

export default Policies;
