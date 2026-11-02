/*
   The route table, assembled from one file per resource. `index.js` still sees a
   single flat `api` map: the split is about where the code lives, never about how
   a request finds it.
*/
import { routes as people } from './routes/people.js';
import { routes as projects } from './routes/projects.js';
import { routes as catalogue } from './routes/catalogue.js';
import { routes as info } from './routes/info.js';
import { routes as devices } from './routes/devices.js';
import { routes as files } from './routes/files.js';
import { routes as checklists } from './routes/checklists.js';

export const api = {
  ...people,
  ...projects,
  ...catalogue,
  ...info,
  ...devices,
  ...files,
  ...checklists,
};
