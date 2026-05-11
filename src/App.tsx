import { createHashRouter, RouterProvider } from 'react-router-dom';
import MenuPage from './pages/MenuPage.tsx';
import LayoutPage from './pages/LayoutPage.tsx';
import EditorPage from './pages/EditorPage.tsx';
import PrintPage from './pages/PrintPage.tsx';

const router = createHashRouter([
  { path: '/', element: <MenuPage /> },
  { path: '/layout', element: <LayoutPage /> },
  { path: '/editor', element: <EditorPage /> },
  { path: '/print', element: <PrintPage /> },
]);

const App = () => <RouterProvider router={router} />;

export default App;
