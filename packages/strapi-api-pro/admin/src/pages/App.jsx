import React from 'react';
import { Box, Typography, Flex, Button } from '@strapi/design-system';
import Recordings from './Recordings';
import Interfaces from './Interfaces';
import Policies from './Policies';
import DomainsRoles from './DomainsRoles';
import Users from './Users';

const App = () => {
  const [page, setPage] = React.useState('domains-roles');
  // Pre-selection for the Policies page so other pages can deep-link
  // straight into the Method Editor for a specific (interface, method).
  const [policiesSelection, setPoliciesSelection] = React.useState(null);

  const openPoliciesForMethod = (selection) => {
    setPoliciesSelection(selection);
    setPage('policies');
  };

  const renderPage = () => {
    if (page === 'interfaces') return <Interfaces onOpenMethod={openPoliciesForMethod} />;
    if (page === 'policies') return (
      <Policies
        initialSelection={policiesSelection}
        onConsumeInitialSelection={() => setPoliciesSelection(null)}
      />
    );
    if (page === 'domains-roles') return <DomainsRoles />;
    if (page === 'users') return <Users />;
    return <Recordings />;
  };

  return (
    <Box padding={8}>
      <Typography variant="alpha">Strapi API Pro</Typography>
      <Typography variant="omega">Recordings, interfaces, method policies, and domain-role management.</Typography>
      <Box paddingTop={4} paddingBottom={4}>
        <Flex gap={2} wrap="wrap">
          <Button variant={page === 'recordings' ? 'default' : 'secondary'} onClick={() => setPage('recordings')}>Recordings</Button>
          <Button variant={page === 'interfaces' ? 'default' : 'secondary'} onClick={() => setPage('interfaces')}>Interfaces</Button>
          <Button variant={page === 'policies' ? 'default' : 'secondary'} onClick={() => setPage('policies')}>Policies</Button>
          <Button variant={page === 'domains-roles' ? 'default' : 'secondary'} onClick={() => setPage('domains-roles')}>Domains & Roles</Button>
          <Button variant={page === 'users' ? 'default' : 'secondary'} onClick={() => setPage('users')}>Users</Button>
        </Flex>
      </Box>
      {renderPage()}
    </Box>
  );
};

export default App;
