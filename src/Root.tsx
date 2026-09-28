import { MantineProvider } from '@mantine/core';
import App from './App';
import { CarePlanWorkspace, Landing, SubformWorkspace } from './SemiCustom';

export function Root() {
  const path = window.location.pathname;
  const Page = path === '/semi/subform' ? SubformWorkspace : path === '/semi/care-plan' ? CarePlanWorkspace : path === '/full-custom' ? App : Landing;
  return <MantineProvider defaultColorScheme="light"><Page /></MantineProvider>;
}
