import { PERSONAS } from './presence.js';
// The crew job board in the World panel: what is queued, who took it, how it went.
const BADGE={open:'queued',waiting:'waiting for wood',running:'in progress',done:'done',failed:'failed'};
export function jobsPanel(dialog,network){
 const section=document.createElement('section');section.className='world-feature jobs-feature';
 section.innerHTML='<h3>Crew jobs</h3><p>Ask a companion in Build or Auto to “plan” several builds; free companions take jobs one by one and gather wood when they run short.</p><ol class="job-list" aria-live="polite"></ol>';
 (dialog.querySelector('.world-feature')??dialog.querySelector('.presence-list'))?.after(section);
 const list=section.querySelector('ol');
 const render=jobs=>{
  list.replaceChildren();
  if(!jobs?.length){const li=document.createElement('li');li.className='job-empty';li.textContent='No jobs yet.';list.append(li);return;}
  for(const job of jobs.slice().reverse()){
   const li=document.createElement('li'),title=document.createElement('strong'),meta=document.createElement('span');
   li.className=`job ${job.status}`;title.textContent=job.label;
   meta.textContent=[BADGE[job.status]??job.status,job.assignee?PERSONAS[job.assignee]?.name:null,job.result].filter(Boolean).join(' · ');
   li.append(title,meta);list.append(li);
  }
 };
 render([]);
 network.on('extensions',data=>render(data.jobs??[]));
 network.on('jobs',m=>render(m.jobs));
}
