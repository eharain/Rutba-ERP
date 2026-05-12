import React from 'react';
import { Box, Typography, Button, Flex, TextInput } from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';

const Interfaces = () => {
  const { post, get, patch } = useFetchClient();
  const [routePath, setRoutePath] = React.useState('/cms-footers/:id');
  const [signature, setSignature] = React.useState('documentId');
  const [result, setResult] = React.useState(null);
  const [lint, setLint] = React.useState(null);
  const [message, setMessage] = React.useState('');

  const parseSignature = () =>
    signature
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

  const validate = async () => {
    setMessage('');
    try {
      const { data } = await post('/api-pro/interfaces/validate-alignment', {
        path: routePath,
        inputSignature: parseSignature(),
      });
      setResult(data?.data || null);
    } catch {
      setMessage('Validation failed.');
    }
  };

  const previewFix = async () => {
    setMessage('');
    try {
      const { data } = await post('/api-pro/interfaces/preview-guided-fix', {
        path: routePath,
        inputSignature: parseSignature(),
      });
      setResult(data?.data || null);
    } catch {
      setMessage('Guided fix preview failed.');
    }
  };

  const runLint = async () => {
    setMessage('');
    try {
      const { data } = await get('/api-pro/interfaces/lint-scaffold');
      setLint(data?.data || null);
    } catch {
      setMessage('Lint failed.');
    }
  };

  const applyExample = async () => {
    setMessage('Use guidedFix=true when calling PATCH /api-pro/interfaces/:interfaceId/methods.');
    try {
      await patch('/api-pro/interfaces/0/methods', {
        name: 'byIdPublished',
        path: routePath,
        method: 'get',
        inputSignature: parseSignature(),
        guidedFix: true,
        strictAlignment: true,
      });
    } catch {
      // demo action intentionally targets placeholder interface id
    }
  };

  return (
    <Box padding={6}>
      <Typography variant="beta">API Interfaces</Typography>
      <Typography variant="omega">Alignment diagnostics and guided param-name fixes.</Typography>

      <Box paddingTop={4}>
        <TextInput label="Route Path" value={routePath} onChange={(e) => setRoutePath(e.target.value)} />
      </Box>
      <Box paddingTop={3}>
        <TextInput
          label="Input Signature (comma separated)"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
        />
      </Box>

      <Flex gap={2} paddingTop={4} wrap="wrap">
        <Button onClick={validate}>Validate Alignment</Button>
        <Button variant="secondary" onClick={previewFix}>Preview Guided Fix</Button>
        <Button variant="secondary" onClick={runLint}>Lint Scaffold</Button>
        <Button variant="tertiary" onClick={applyExample}>Apply (example)</Button>
      </Flex>

      {message && (
        <Box paddingTop={3}>
          <Typography textColor="neutral600">{message}</Typography>
        </Box>
      )}

      {result && (
        <Box paddingTop={4}>
          <Typography variant="sigma">Alignment Result</Typography>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </Box>
      )}

      {lint && (
        <Box paddingTop={4}>
          <Typography variant="sigma">Scaffold Lint</Typography>
          <pre>{JSON.stringify(lint, null, 2)}</pre>
        </Box>
      )}
    </Box>
  );
};

export default Interfaces;
