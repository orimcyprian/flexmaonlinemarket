const toggle=document.querySelector('.menu-toggle'),nav=document.querySelector('.nav');
toggle.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.textContent=open?'×':'☰'});
document.querySelectorAll('.nav a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.textContent='☰'}));
document.querySelectorAll('[data-course]').forEach(a=>a.addEventListener('click',()=>{const select=document.querySelector('[name="course"]');select.value=a.dataset.course}));
document.querySelectorAll('[data-service]').forEach(a=>a.addEventListener('click',()=>{const msg=document.querySelector('[name="message"]');msg.value='I would like to enquire about: '+a.dataset.service+'.'}));
document.querySelector('#year').textContent=new Date().getFullYear();
const form=document.querySelector('#registrationForm');
form.addEventListener('submit',async e=>{
  e.preventDefault();
  const success=form.querySelector('.form-success'),button=form.querySelector('button[type="submit"]');
  const data=Object.fromEntries(new FormData(form).entries());
  button.disabled=true;button.textContent='Submitting…';success.style.display='none';
  try{
    const response=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Registration could not be submitted.');
    success.style.display='block';success.textContent=result.message;
    form.reset();
  }catch(err){success.style.display='block';success.textContent=err.message;}
  finally{button.disabled=false;button.innerHTML='Register free <span>→</span>';}
});