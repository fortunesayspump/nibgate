import React from 'react';
import { createRoot } from 'react-dom/client';
import ResearchNewPage from '../../../frontend/src/app/dr-nib/research/page';
import {TestDialog} from './mocks';
const root=createRoot(document.getElementById('root')!);
(window as any).__unmountResearch=()=>root.render(<TestDialog/>);
root.render(<><ResearchNewPage/><TestDialog/></>);
