const { getStore } = require("@netlify/blobs");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const store = getStore("flexma-online-market");
const states = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];
const seedCourses = [
 ["Website Development","Plan, build and publish professional websites for businesses, organisations and personal projects.","Technology"],
 ["Video Animation","Create engaging animated videos using modern digital tools.","Creative Media"],
 ["Graphics Design","Design flyers, banners, logos, social media graphics and branding materials.","Visual Design"],
 ["CAC Registration","Understand Business Name, Limited Liability Company and Incorporated Trustees registration processes.","Business Support"],
 ["SCUML Registration","Learn about SCUML requirements, documentation and the application process.","Business Support"],
 ["Social Media Ads","Plan, create, run and improve advertisements on relevant social media platforms.","Digital Marketing"],
 ["Cartoon Video Making","Create cartoon characters, animated stories and cartoon videos.","Animation"]
];
const json = (statusCode, body, extra={}) => ({statusCode,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...extra},body:JSON.stringify(body)});
const readBody = e => {try{return JSON.parse(e.body||"{}")}catch{return {}}};
const clean = (v,n=2000)=>String(v??"").trim().slice(0,n);
async function getData(key, fallback=[]){return (await store.get(key,{type:"json"}))??fallback}
async function setData(key,value){await store.setJSON(key,value)}
function sign(payload){const b=Buffer.from(JSON.stringify(payload)).toString("base64url");const sig=crypto.createHmac("sha256",process.env.SESSION_SECRET||"replace-session-secret").update(b).digest("base64url");return b+"."+sig}
function verify(token){try{const [b,s]=String(token||"").split(".");const expected=crypto.createHmac("sha256",process.env.SESSION_SECRET||"replace-session-secret").update(b).digest();const actual=Buffer.from(s,"base64url");if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return false;const p=JSON.parse(Buffer.from(b,"base64url").toString());return p.exp>Date.now()}catch{return false}}
function cookie(token,maxAge=28800){return `flexma_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`}
function isAdmin(e){const c=(e.headers.cookie||e.headers.Cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("flexma_admin="));return c&&verify(c.split("=").slice(1).join("="))}
async function sendMail(subject,text){
 if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASS||!process.env.NOTIFICATION_EMAIL)return false;
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==="true",auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
 await transport.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to:process.env.NOTIFICATION_EMAIL,subject,text});return true;
}
exports.handler=async(event)=>{
 const method=event.httpMethod,path=event.path.replace(/^\/\.netlify\/functions\/api/,"").replace(/\/+$/,"")||"/";
 const body=readBody(event);
 try{
  if(method==="GET"&&path==="/courses"){
   const courses=await getCourses();return json(200,courses.filter(c=>c.published));
  }
  if(method==="POST"&&path==="/register"){
   const name=clean(body.name,120),phone=clean(body.phone,30),state=clean(body.state,40),course=clean(body.course,120),message=clean(body.message,1500);
   if(body.website)return json(400,{error:"Unable to process registration."});
   if(!name||!phone||!state||!course)return json(400,{error:"Please complete all required fields."});
   if(!/^[+0-9()\- \t]{10,25}$/.test(phone)||phone.replace(/\D/g,"").length<10)return json(400,{error:"Please enter a valid WhatsApp number."});
   if(!states.includes(state))return json(400,{error:"Please select a valid Nigerian state."});
   const courses=await getCourses();
   if(!courses.some(c=>c.title===course&&c.published))return json(400,{error:"Please select an available course."});
   const rows=await getData("students",[]),record={id:Date.now(),full_name:name,phone,state,course,message,status:"new",email_sent:false,created_at:new Date().toISOString()};
   rows.unshift(record);await setData("students",rows);
   try{record.email_sent=await sendMail("New Flexma course registration: "+name,`Name: ${name}\nWhatsApp: ${phone}\nState: ${state}\nCourse: ${course}\nMessage: ${message||"None"}\nDate: ${record.created_at}`);if(record.email_sent)await setData("students",rows)}catch(err){console.error("Mail failed",err)}
   return json(201,{ok:true,message:"Thank you for registering with Flexma Online Market. Your registration has been received. We will contact you through WhatsApp or email with further information about your training."});
  }
  if(method==="POST"&&path==="/admin/login"){
   const email=clean(body.email,180).toLowerCase(),password=String(body.password||"");
   const adminEmail=(process.env.ADMIN_EMAIL||"").toLowerCase(),hash=process.env.ADMIN_PASSWORD_HASH||"";
   let valid=false;
   if(hash){valid=bcrypt.compareSync(password,hash)}
   else if(process.env.ADMIN_PASSWORD){const a=Buffer.from(password),b=Buffer.from(process.env.ADMIN_PASSWORD);valid=a.length===b.length&&crypto.timingSafeEqual(a,b)}
   if(!adminEmail||email!==adminEmail||!valid)return json(401,{error:"Email or password is incorrect."});
   const token=sign({email,exp:Date.now()+8*60*60*1000});
   return json(200,{ok:true,email},{ "Set-Cookie":cookie(token) });
  }
  if(method==="POST"&&path==="/admin/logout")return json(200,{ok:true},{ "Set-Cookie":cookie("",0) });
  if(path.startsWith("/admin/")){
   const admin=isAdmin(event);if(!admin)return json(401,{error:"Administrator sign-in required."});
   if(method==="GET"&&path==="/admin/me"){const c=(event.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("flexma_admin="));const payload=JSON.parse(Buffer.from(c.split(".")[0].split("=")[1],"base64url").toString());return json(200,{email:payload.email})}
   if(method==="GET"&&path==="/admin/overview"){
    const students=await getData("students",[]),courses=await getCourses(),lessons=await getData("lessons",[]),enquiries=await getData("enquiries",[]);
    return json(200,{students:students.length,newStudents:students.filter(s=>s.status==="new").length,courses:courses.length,lessons:lessons.length,enquiries:enquiries.length});
   }
   if(method==="GET"&&path==="/admin/students"){
    let rows=await getData("students",[]),q=clean(event.queryStringParameters?.q,100).toLowerCase(),status=clean(event.queryStringParameters?.status,20);
    rows=rows.filter(r=>(!q||[r.full_name,r.phone,r.course,r.state].some(v=>String(v).toLowerCase().includes(q)))&&(!status||r.status===status));return json(200,rows);
   }
   if(method==="PATCH"&&path.startsWith("/admin/students/")){
    const id=Number(path.split("/").pop()),rows=await getData("students",[]),r=rows.find(x=>x.id===id);
    if(!r)return json(404,{error:"Student not found."});if(!["new","contacted","enrolled","completed"].includes(body.status))return json(400,{error:"Invalid status."});
    r.status=body.status;await setData("students",rows);return json(200,{ok:true});
   }
   if(method==="GET"&&path==="/admin/students.csv"){
    const rows=await getData("students",[]),keys=["id","full_name","phone","state","course","message","status","email_sent","created_at"],cell=v=>'"'+String(v??"").replace(/"/g,'""').replace(/[\r\n]+/g," ")+'"';
    return {statusCode:200,headers:{"Content-Type":"text/csv","Content-Disposition":"attachment; filename=flexma-students.csv"},body:[keys.join(","),...rows.map(r=>keys.map(k=>cell(r[k])).join(","))].join("\r\n")};
   }
   if(method==="GET"&&path==="/admin/courses")return json(200,await getCourses());
   if(method==="POST"&&path==="/admin/courses"){
    const rows=await getCourses();const r={id:Date.now(),title:clean(body.title,120),description:clean(body.description,1500),category:clean(body.category,80)||"Digital Skills",published:!!body.published,is_free:!!body.is_free,sort_order:Number(body.sort_order)||rows.length};if(!r.title)return json(400,{error:"Course title is required."});rows.push(r);await setData("courses",rows);return json(201,r);
   }
   if(method==="PATCH"&&path.startsWith("/admin/courses/")){
    const id=Number(path.split("/").pop()),rows=await getCourses(),r=rows.find(x=>x.id===id);if(!r)return json(404,{error:"Course not found."});
    ["title","description","category","published","is_free","sort_order"].forEach(k=>{if(body[k]!==undefined)r[k]=["published","is_free"].includes(k)?!!body[k]:body[k]});await setData("courses",rows);return json(200,{ok:true});
   }
   if(method==="DELETE"&&path.startsWith("/admin/courses/")){
    const id=Number(path.split("/").pop());await setData("courses",(await getCourses()).filter(x=>x.id!==id));return json(200,{ok:true});
   }
   if(method==="GET"&&path==="/admin/lessons")return json(200,await getData("lessons",[]));
   if(method==="POST"&&path==="/admin/lessons"){
    const rows=await getData("lessons",[]),r={id:Date.now(),course_id:Number(body.course_id),title:clean(body.title,160),description:clean(body.description,1500),video_url:clean(body.video_url,1000),thumbnail_url:clean(body.thumbnail_url,1000),lesson_order:Number(body.lesson_order)||0,published:!!body.published};
    if(!r.course_id||!r.title)return json(400,{error:"Course and lesson title are required."});if(r.video_url&&!/^https:\/\//i.test(r.video_url))return json(400,{error:"Use a secure HTTPS video URL."});
    const courses=await getCourses();r.course_title=courses.find(c=>c.id===r.course_id)?.title||"Course";rows.push(r);await setData("lessons",rows);return json(201,r);
   }
   if(method==="DELETE"&&path.startsWith("/admin/lessons/")){const id=Number(path.split("/").pop());await setData("lessons",(await getData("lessons",[])).filter(x=>x.id!==id));return json(200,{ok:true})}
   if(method==="GET"&&path==="/admin/schedules")return json(200,await getData("schedules",[]));
   if(method==="POST"&&path==="/admin/schedules"){
    const rows=await getData("schedules",[]),r={id:Date.now(),course_id:Number(body.course_id)||null,title:clean(body.title,160),starts_at:clean(body.starts_at,40),platform:clean(body.platform,60),joining_instructions:clean(body.joining_instructions,1500),published:!!body.published};if(!r.title||!r.starts_at)return json(400,{error:"Schedule title and date/time are required."});rows.push(r);await setData("schedules",rows);return json(201,r);
   }
   if(method==="DELETE"&&path.startsWith("/admin/schedules/")){const id=Number(path.split("/").pop());await setData("schedules",(await getData("schedules",[])).filter(x=>x.id!==id));return json(200,{ok:true})}
   if(method==="GET"&&path==="/admin/enquiries")return json(200,await getData("enquiries",[]));
   return json(404,{error:"Admin endpoint not found."});
  }
  if(method==="POST"&&path==="/enquiry"){
   const name=clean(body.name,120),email=clean(body.email,180),phone=clean(body.phone,30),service=clean(body.service,120),message=clean(body.message,2000);
   if(!name||!message)return json(400,{error:"Name and message are required."});
   const rows=await getData("enquiries",[]),r={id:Date.now(),name,email,phone,service,message,status:"new",created_at:new Date().toISOString()};rows.unshift(r);await setData("enquiries",rows);
   try{await sendMail("Flexma enquiry: "+(service||"General"),`Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nService: ${service}\nMessage: ${message}`)}catch(err){console.error("Enquiry mail failed",err)}
   return json(201,{ok:true});
  }
  return json(404,{error:"Endpoint not found."});
 }catch(err){console.error(err);return json(500,{error:"A server error occurred. Please try again."})}
};
