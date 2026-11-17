import { getStore } from "@netlify/blobs";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import crypto from "node:crypto";

const states = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo",
  "Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos",
  "Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers",
  "Sokoto","Taraba","Yobe","Zamfara"
];

const seedCourses = [
  ["Website Development","Plan, build and publish professional websites for businesses, organisations and personal projects.","Technology"],
  ["Video Animation","Create engaging animated videos using modern digital tools.","Creative Media"],
  ["Graphics Design","Design flyers, banners, logos, social media graphics and branding materials.","Visual Design"],
  ["CAC Registration","Understand Business Name, Limited Liability Company and Incorporated Trustees registration processes.","Business Support"],
  ["SCUML Registration","Learn about SCUML requirements, documentation and the application process.","Business Support"],
  ["Social Media Ads","Plan, create, run and improve advertisements on relevant social media platforms.","Digital Marketing"],
  ["Cartoon Video Making","Create cartoon characters, animated stories and cartoon videos.","Animation"]
];

const json = (status, data, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });

const clean = (value, max = 2000) => String(value ?? "").trim().slice(0, max);

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

async function getData(store, key, fallback = []) {
  return (await store.get(key, { type: "json" })) ?? fallback;
}

async function setData(store, key, value) {
  await store.setJSON(key, value);
}

async function getCourses(store) {
  const saved = await store.get("courses", { type: "json" });
  if (Array.isArray(saved)) return saved;

  const initial = seedCourses.map((course, index) => ({
    id: index + 1,
    title: course[0],
    description: course[1],
    category: course[2],
    published: true,
    is_free: true,
    sort_order: index
  }));
  await store.setJSON("courses", initial);
  return initial;
}

async function sendMail(subject, text) {
  const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "NOTIFICATION_EMAIL"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing email configuration: ${missing.join(", ")}`);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: process.env.NOTIFICATION_EMAIL,
    subject,
    text
  });
}

function sign(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "")
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verify(token) {
  try {
    if (!process.env.SESSION_SECRET) return false;
    const [encoded, signature] = String(token || "").split(".");
    if (!encoded || !signature) return false;
    const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET)
      .update(encoded).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

function cookie(token, maxAge = 28800) {
  return `flexma_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const entry = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : "";
}

function isAdmin(request) {
  return verify(getCookie(request, "flexma_admin"));
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
}

/*
 * Netlify Functions v2 handler.
 * IMPORTANT: getStore() must be created inside this request handler so
 * Netlify can provide the Blobs site/token context at runtime.
 */
export default async function handler(request, context) {
  try {
    const store = getStore("flexma-online-market");
    const url = new URL(request.url);
    let path = url.pathname.replace(/^\/(?:\.netlify\/functions\/api|api)(?=\/|$)/, "");
    if (!path) path = "/";
    path = path.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();
    const body = method === "GET" || method === "HEAD" ? {} : await readBody(request);

    if (method === "GET" && path === "/courses") {
      const courses = await getCourses(store);
      return json(200, courses.filter((course) => course.published));
    }

    if (method === "POST" && path === "/register") {
      const name = clean(body.name, 120);
      const phone = clean(body.phone, 30);
      const state = clean(body.state, 40);
      const course = clean(body.course, 120);
      const message = clean(body.message, 1500);

      if (body.website) return json(400, { error: "Unable to process registration." });
      if (!name || !phone || !state || !course) {
        return json(400, { error: "Please complete all required fields." });
      }
      if (!/^[+0-9()\- \t]{10,25}$/.test(phone) || phone.replace(/\D/g, "").length < 10) {
        return json(400, { error: "Please enter a valid WhatsApp number." });
      }
      if (!states.includes(state)) return json(400, { error: "Please select a valid Nigerian state." });

      const courses = await getCourses(store);
      if (!courses.some((item) => item.title === course && item.published)) {
        return json(400, { error: "Please select an available course." });
      }

      const rows = await getData(store, "students", []);
      const record = {
        id: Date.now(),
        full_name: name,
        phone,
        state,
        course,
        message,
        status: "new",
        email_sent: false,
        created_at: new Date().toISOString()
      };
      rows.unshift(record);
      await setData(store, "students", rows);

      try {
        await sendMail(
          `New Flexma course registration: ${name}`,
          `Name: ${name}\nWhatsApp: ${phone}\nState: ${state}\nCourse: ${course}\nMessage: ${message || "None"}\nDate: ${record.created_at}`
        );
        record.email_sent = true;
        await setData(store, "students", rows);
      } catch (mailError) {
        console.error("Registration saved, but notification email failed:", mailError);
      }

      return json(201, {
        ok: true,
        emailSent: record.email_sent,
        message: record.email_sent
          ? "Thank you for registering with Flexma Online Market. Your registration has been received. We will contact you with further information."
          : "Your registration has been received, but the email notification could not be sent. Flexma will follow up with you."
      });
    }

    if (method === "POST" && path === "/admin/login") {
      const email = clean(body.email, 180).toLowerCase();
      const password = String(body.password || "");
      const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();
      const hash = process.env.ADMIN_PASSWORD_HASH || "";
      let valid = false;

      if (hash) valid = bcrypt.compareSync(password, hash);
      else if (process.env.ADMIN_PASSWORD) {
        const supplied = Buffer.from(password);
        const expected = Buffer.from(process.env.ADMIN_PASSWORD);
        valid = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
      }

      if (!adminEmail || email !== adminEmail || !valid) {
        return json(401, { error: "Email or password is incorrect." });
      }
      if (!process.env.SESSION_SECRET) {
        return json(500, { error: "Administrator session is not configured." });
      }
      const token = sign({ email, exp: Date.now() + 8 * 60 * 60 * 1000 });
      return json(200, { ok: true, email }, { "Set-Cookie": cookie(token) });
    }

    if (method === "POST" && path === "/admin/logout") {
      return json(200, { ok: true }, { "Set-Cookie": cookie("", 0) });
    }

    if (path.startsWith("/admin/")) {
      if (!isAdmin(request)) return json(401, { error: "Administrator sign-in required." });

      if (method === "GET" && path === "/admin/me") {
        const token = getCookie(request, "flexma_admin");
        const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
        return json(200, { email: payload.email });
      }

      if (method === "GET" && path === "/admin/overview") {
        const students = await getData(store, "students", []);
        const courses = await getCourses(store);
        const lessons = await getData(store, "lessons", []);
        const enquiries = await getData(store, "enquiries", []);
        return json(200, {
          students: students.length,
          newStudents: students.filter((student) => student.status === "new").length,
          courses: courses.length,
          lessons: lessons.length,
          enquiries: enquiries.length
        });
      }

      if (method === "GET" && path === "/admin/students") {
        let rows = await getData(store, "students", []);
        const query = clean(url.searchParams.get("q"), 100).toLowerCase();
        const status = clean(url.searchParams.get("status"), 20);
        rows = rows.filter((row) =>
          (!query || [row.full_name, row.phone, row.course, row.state]
            .some((value) => String(value).toLowerCase().includes(query))) &&
          (!status || row.status === status)
        );
        return json(200, rows);
      }

      if (method === "PATCH" && path.startsWith("/admin/students/")) {
        const id = Number(path.split("/").pop());
        const rows = await getData(store, "students", []);
        const row = rows.find((item) => item.id === id);
        if (!row) return json(404, { error: "Student not found." });
        if (!["new", "contacted", "enrolled", "completed"].includes(body.status)) {
          return json(400, { error: "Invalid status." });
        }
        row.status = body.status;
        await setData(store, "students", rows);
        return json(200, { ok: true });
      }

      if (method === "GET" && path === "/admin/students.csv") {
        const rows = await getData(store, "students", []);
        const keys = ["id", "full_name", "phone", "state", "course", "message", "status", "email_sent", "created_at"];
        const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(","))].join("\r\n");
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="flexma-students.csv"'
          }
        });
      }

      if (method === "GET" && path === "/admin/courses") return json(200, await getCourses(store));

      if (method === "POST" && path === "/admin/courses") {
        const rows = await getCourses(store);
        const row = {
          id: Date.now(),
          title: clean(body.title, 120),
          description: clean(body.description, 1500),
          category: clean(body.category, 80) || "Digital Skills",
          published: !!body.published,
          is_free: !!body.is_free,
          sort_order: Number(body.sort_order) || rows.length
        };
        if (!row.title) return json(400, { error: "Course title is required." });
        rows.push(row);
        await setData(store, "courses", rows);
        return json(201, row);
      }

      if (method === "PATCH" && path.startsWith("/admin/courses/")) {
        const id = Number(path.split("/").pop());
        const rows = await getCourses(store);
        const row = rows.find((item) => item.id === id);
        if (!row) return json(404, { error: "Course not found." });
        ["title", "description", "category", "published", "is_free", "sort_order"].forEach((key) => {
          if (body[key] !== undefined) row[key] = ["published", "is_free"].includes(key) ? !!body[key] : body[key];
        });
        await setData(store, "courses", rows);
        return json(200, { ok: true });
      }

      if (method === "DELETE" && path.startsWith("/admin/courses/")) {
        const id = Number(path.split("/").pop());
        await setData(store, "courses", (await getCourses(store)).filter((item) => item.id !== id));
        return json(200, { ok: true });
      }

      if (method === "GET" && path === "/admin/lessons") return json(200, await getData(store, "lessons", []));

      if (method === "POST" && path === "/admin/lessons") {
        const rows = await getData(store, "lessons", []);
        const row = {
          id: Date.now(),
          course_id: Number(body.course_id),
          title: clean(body.title, 160),
          description: clean(body.description, 1500),
          video_url: clean(body.video_url, 1000),
          thumbnail_url: clean(body.thumbnail_url, 1000),
          lesson_order: Number(body.lesson_order) || 0,
          published: !!body.published
        };
        if (!row.course_id || !row.title) return json(400, { error: "Course and lesson title are required." });
        if (row.video_url && !/^https:\/\//i.test(row.video_url)) return json(400, { error: "Use a secure HTTPS video URL." });
        const courses = await getCourses(store);
        row.course_title = courses.find((item) => item.id === row.course_id)?.title || "Course";
        rows.push(row);
        await setData(store, "lessons", rows);
        return json(201, row);
      }

      if (method === "DELETE" && path.startsWith("/admin/lessons/")) {
        const id = Number(path.split("/").pop());
        await setData(store, "lessons", (await getData(store, "lessons", [])).filter((item) => item.id !== id));
        return json(200, { ok: true });
      }

      if (method === "GET" && path === "/admin/schedules") return json(200, await getData(store, "schedules", []));

      if (method === "POST" && path === "/admin/schedules") {
        const rows = await getData(store, "schedules", []);
        const row = {
          id: Date.now(),
          course_id: Number(body.course_id) || null,
          title: clean(body.title, 160),
          starts_at: clean(body.starts_at, 40),
          platform: clean(body.platform, 60),
          joining_instructions: clean(body.joining_instructions, 1500),
          published: !!body.published
        };
        if (!row.title || !row.starts_at) return json(400, { error: "Schedule title and date/time are required." });
        rows.push(row);
        await setData(store, "schedules", rows);
        return json(201, row);
      }

      if (method === "DELETE" && path.startsWith("/admin/schedules/")) {
        const id = Number(path.split("/").pop());
        await setData(store, "schedules", (await getData(store, "schedules", [])).filter((item) => item.id !== id));
        return json(200, { ok: true });
      }

      if (method === "GET" && path === "/admin/enquiries") return json(200, await getData(store, "enquiries", []));
      return json(404, { error: "Admin endpoint not found." });
    }

    if (method === "POST" && path === "/enquiry") {
      const name = clean(body.name, 120);
      const email = clean(body.email, 180);
      const phone = clean(body.phone, 30);
      const service = clean(body.service, 120);
      const message = clean(body.message, 2000);
      if (!name || !message) return json(400, { error: "Name and message are required." });
      const rows = await getData(store, "enquiries", []);
      const row = {
        id: Date.now(), name, email, phone, service, message,
        status: "new", created_at: new Date().toISOString()
      };
      rows.unshift(row);
      await setData(store, "enquiries", rows);
      try {
        await sendMail(
          `Flexma enquiry: ${service || "General"}`,
          `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nService: ${service}\nMessage: ${message}`
        );
      } catch (mailError) {
        console.error("Enquiry saved, but notification email failed:", mailError);
      }
      return json(201, { ok: true });
    }

    return json(404, { error: "Endpoint not found." });
  } catch (error) {
    console.error("Flexma API function error:", error);
    return json(500, { error: "A server error occurred. Please try again." });
  }
}
