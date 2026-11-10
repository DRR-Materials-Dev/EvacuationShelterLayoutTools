import { Group, Title, ActionIcon, Tooltip } from '@mantine/core';
import { IconArrowLeft, IconHelp } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { manualUrl } from '../manual.ts';

type Props = {
  title: string;
  right?: ReactNode;
  /** このツールのマニュアルの章（public/manual/index.html のアンカー）。指定すると「？」ボタンを出す。 */
  manualSection?: string;
};

const AppHeader = ({ title, right, manualSection }: Props) => {
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
        {manualSection && (
          <Tooltip label="使い方マニュアル（別のタブ・ウィンドウで開きます）">
            <ActionIcon
              component="a"
              href={manualUrl(manualSection)}
              target="_blank"
              rel="noopener"
              variant="subtle"
              color="gray"
              size="lg"
              aria-label="使い方マニュアル"
            >
              <IconHelp size={20} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      {right}
    </Group>
  );
};

export default AppHeader;
