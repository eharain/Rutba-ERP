import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Page } from '@strapi/strapi/admin';
import { Box, Flex, Typography, Button, Main } from '@strapi/design-system';
import { ConfigTab } from '../../components/ConfigTab';
import { ContentTypesTab } from '../../components/ContentTypesTab';
import { SyncTab } from '../../components/SyncTab';
import { LogsTab } from '../../components/LogsTab';

const TABS = [
  { key: 'config', label: 'Configuration' },
  { key: 'content-types', label: 'Content Types' },
  { key: 'sync', label: 'Sync' },
  { key: 'logs', label: 'Logs' },
];

const HomePage = () => {
  const [activeTab, setActiveTab] = useState('config');

  return (
    <Main>
      <Box padding={8} background="neutral100">
        <Typography variant="alpha" tag="h1">
          Strapi-to-Strapi Data Sync
        </Typography>

        <Box paddingTop={4} paddingBottom={6}>
          <Flex gap={2}>
            {TABS.map((tab) => (
              <Button
                key={tab.key}
                variant={activeTab === tab.key ? 'default' : 'tertiary'}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </Button>
            ))}
          </Flex>
        </Box>

        {activeTab === 'config' && <ConfigTab />}
        {activeTab === 'content-types' && <ContentTypesTab />}
        {activeTab === 'sync' && <SyncTab />}
        {activeTab === 'logs' && <LogsTab />}
      </Box>
    </Main>
  );
};

const App = () => {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="*" element={<Page.Error />} />
    </Routes>
  );
};

export { App };
export default App;
