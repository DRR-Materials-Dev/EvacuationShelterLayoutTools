import { Group, Title, ActionIcon, Tooltip } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  right?: ReactNode;
};

const AppHeader = ({ title, right }: Props) => {
  const navigate = useNavigate();

  return (
    <Group
      justify="space-between"
      px="md"
      py="xs"
      style={{
        borderBottom: '1px solid #e0e0e0',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <Group gap="sm">
        <Tooltip label="メニューに戻る">
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label="メニューに戻る"
            onClick={() => navigate('/')}
          >
            <IconArrowLeft size={20} />
          </ActionIcon>
        </Tooltip>
        <Title order={3} style={{ margin: 0 }}>
          {title}
        </Title>
      </Group>
      {right}
    </Group>
  );
};

export default AppHeader;
