import express from "express";
import session from "express-session";
import flash from "connect-flash";
import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const { Pool } = pkg;

// Ajuste para usar __dirname com ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração do servidor Express
const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// Configuração de sessão
app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());

// Conexão com PostgreSQL (Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Middleware para mensagens e dados globais
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.warning = req.flash("warning");
  res.locals.username = req.session.username;
  next();
});

// Página inicial
app.get("/", (req, res) => {
  if (req.session.userId) return res.redirect("/list_items");
  res.redirect("/login");
});

// Registro de usuário
app.get("/register", (req, res) => res.render("register"));

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    req.flash("warning", "Preencha todos os campos.");
    return res.redirect("/register");
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO usuarios (username, senha) VALUES ($1, $2)",
      [username, hash]
    );
    req.flash("success", "✅ Cadastro realizado com sucesso! Faça login.");
    res.redirect("/login");
  } catch (err) {
    if (err.code === "23505") {
      req.flash("error", "⚠️ Usuário já existe.");
    } else {
      req.flash("error", `Erro ao cadastrar: ${err.message}`);
    }
    res.redirect("/register");
  }
});

// Login
app.get("/login", (req, res) => res.render("login"));

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    req.flash("warning", "Preencha todos os campos.");
    return res.redirect("/login");
  }

  const result = await pool.query(
    "SELECT id, senha FROM usuarios WHERE username = $1",
    [username]
  );
  const user = result.rows[0];

  if (user && (await bcrypt.compare(password, user.senha))) {
    req.session.userId = user.id;
    req.session.username = username;
    req.flash("success", `Bem-vindo, ${username}!`);
    return res.redirect("/list_items");
  }

  req.flash("error", "Usuário ou senha inválidos.");
  res.redirect("/login");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// Adicionar item
app.get("/items", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.render("add_item");
});

app.post("/items", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const { nome, descricao, preco } = req.body;
  const price = parseFloat(preco.replace(",", "."));
  try {
    await pool.query(
      "INSERT INTO itens (user_id, name, description, price) VALUES ($1, $2, $3, $4)",
      [req.session.userId, nome, descricao, price]
    );
    req.flash("success", "✅ Item adicionado com sucesso!");
    res.redirect("/list_items");
  } catch (err) {
    req.flash("error", `Erro ao adicionar: ${err.message}`);
    res.redirect("/items");
  }
});

// Listar itens
app.get("/list_items", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  const result = await pool.query("SELECT * FROM itens ORDER BY id DESC");
  res.render("list_items", { items: result.rows });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando em http://localhost:${PORT}`));
