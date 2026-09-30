import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import App from './App';
import { CarePlanLibrary, CarePlanWorkspace, Landing, SubformWorkspace } from './SemiCustom';
import { ResponseLibrary } from './Responses';
import { FullCustomLibrary } from './FullCustomLibrary';

export function Root() {
  const path = window.location.pathname;
  const Page =
    path === '/responses'
      ? ResponseLibrary
      : path === '/semi/subform'
        ? SubformWorkspace
        : path === '/semi/care-plan'
          ? CarePlanLibrary
          : path.startsWith('/semi/care-plan')
            ? CarePlanWorkspace
            : path === '/full-custom'
              ? FullCustomLibrary
              : path.startsWith('/full-custom')
                ? App
                : Landing;
  return (
    <MantineProvider defaultColorScheme="light">
      <Notifications position="top-right" limit={4} />
      <Page />
    </MantineProvider>
  );
}
