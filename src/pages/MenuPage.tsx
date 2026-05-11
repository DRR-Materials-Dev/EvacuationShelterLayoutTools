import { Container, Title, Text, SimpleGrid, Card, Stack, ThemeIcon, Group } from '@mantine/core';
import { IconLayoutGrid, IconEdit, IconPrinter, type IconProps } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import type { ComponentType } from 'react';

type Tool = {
  path: string;
  title: string;
  description: string;
  icon: ComponentType<IconProps>;
  color: string;
};

const tools: Tool[] = [
  {
    path: '/layout',
    title: '避難所レイアウト',
    description:
      '施設の図面画像を読み込み、その上に居住スペースや受付などの区画を配置して避難所のレイアウトを検討します。',
    icon: IconLayoutGrid,
    color: 'blue',
  },
  {
    path: '/editor',
    title: '区画エディタ',
    description:
      '配置する区画の種類を編集します。名称・サイズ・色・画像などをまとめた「区画リスト」を作成・保存できます。',
    icon: IconEdit,
    color: 'teal',
  },
  {
    path: '/print',
    title: '区画印刷',
    description:
      '区画リストから印刷用の HTML を作成します。用紙サイズや縮尺を指定して、紙のレイアウト検討に使えます。',
    icon: IconPrinter,
    color: 'orange',
  },
];

const APP_VERSION = '2.0.0';

const MenuPage = () => {
  const navigate = useNavigate();

  return (
    <Container py="xl" size="lg">
      <Stack gap="xl">
        <Stack gap="xs" align="center">
          <Title order={1} ta="center">
            避難所レイアウトツール
          </Title>
          <Text c="dimmed" ta="center" maw={600}>
            避難所の運営訓練や検討に使えるツール集です。使用したい機能を選んでください。
          </Text>
          <Text c="dimmed" size="xs" ta="center">
            Ver. {APP_VERSION}
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Card
                key={tool.path}
                shadow="sm"
                padding="lg"
                radius="md"
                withBorder
                style={{ cursor: 'pointer', height: '100%' }}
                onClick={() => navigate(tool.path)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(tool.path);
                  }
                }}
              >
                <Stack gap="md">
                  <Group>
                    <ThemeIcon size="xl" radius="md" color={tool.color} variant="light">
                      <Icon size={28} />
                    </ThemeIcon>
                    <Title order={3}>{tool.title}</Title>
                  </Group>
                  <Text size="sm" c="dimmed">
                    {tool.description}
                  </Text>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    </Container>
  );
};

export default MenuPage;
