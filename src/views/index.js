import HierarchyView from './HierarchyView';
import GraphView from './GraphView';
import CardsView from './CardsView';
import SchemaView from './SchemaView';
import TableView from './TableView';
import ColumnsView from './ColumnsView';
import RawView from './RawView';

export const VIEWS = [
  { id: 'tree', label: 'Tree', group: 'Visualization', icon: 'tree', desc: 'Collapsible left-to-right hierarchy', component: HierarchyView, props: { mode: 'tree' } },
  { id: 'radial', label: 'Radial', group: 'Visualization', icon: 'radial', desc: 'The same hierarchy wrapped into a circle', component: HierarchyView, props: { mode: 'radial' } },
  { id: 'graph', label: 'Graph', group: 'Visualization', icon: 'graph', desc: 'Force-directed network; long lists fold into +N nodes', component: GraphView },
  { id: 'cards', label: 'Cards', group: 'Visualization', icon: 'cards', desc: 'Linked cards you open one level at a time', component: CardsView },
  { id: 'schema', label: 'Schema', group: 'Structural', icon: 'schema', desc: 'Inferred schema with presence & value profiles', component: SchemaView },
  { id: 'table', label: 'Table', group: 'Structural', icon: 'table', desc: 'Sortable, filterable grid of record arrays', component: TableView },
  { id: 'columns', label: 'Columns', group: 'Structural', icon: 'columns', desc: 'Finder-style drill-down columns', component: ColumnsView },
  { id: 'raw', label: 'Raw', group: 'Structural', icon: 'raw', desc: 'Syntax-highlighted source with folding', component: RawView },
];
