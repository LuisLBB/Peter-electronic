import express from "express";
import cors from "cors";
import mongoose from "mongoose";

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log("Conectado exitosamente a MongoDB Atlas"))
  .catch(err => console.error("Error al conectar a MongoDB:", err));

const ConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
});
const Config = mongoose.model("Config", ConfigSchema);

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true },
  active: { type: Boolean, default: true },
  originalEmail: { type: String },
  originalUsername: { type: String }
});
const User = mongoose.model("User", UserSchema);

const ProductSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  priceUSD: { type: Number, required: true },
  exchangeRate: { type: Number, required: true },
  imei: { type: String, required: true, unique: true },
  color: { type: String, required: true },
  almacenamiento: { type: String, required: true },
  ram: { type: String, required: true },
  status: { type: String, default: "Disponible" },
  specs: {
    pantalla: String,
    camara: String,
    bateria: String
  }
});
const Product = mongoose.model("Product", ProductSchema);

const SaleSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  datetime: String,
  saleDate: String,
  seller: String,
  totalPrice: Number,
  products: Array
});
const Sale = mongoose.model("Sale", SaleSchema);

const HistorySchema = new mongoose.Schema({
  datetime: String,
  operation: String,
  productName: String,
  quantity: String,
  responsible: String
});
const History = mongoose.model("History", HistorySchema);

app.use(cors({
  origin: ["https://luislbb.github.io", "http://127.0.0.1:5500", "http://localhost:5500"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

async function getExchangeRate() {
  const rateConfig = await Config.findOne({ key: "exchangeRate" });
  return rateConfig ? parseFloat(rateConfig.value) : 6.96;
}

function getLocalDateBO(date = new Date()) {
  // Devuelve la fecha en formato YYYY-MM-DD según la zona horaria de Bolivia
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  return partes; // en-CA ya entrega "YYYY-MM-DD"
}

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const internalUser = await User.findOne({ username: username.toLowerCase().trim() });
    if (internalUser) {
      if (internalUser.active === false) {
        return res.status(403).json({ success: false, message: "Este usuario ha sido desactivado." });
      }
      if (internalUser.password === password.trim()) {
        return res.json({ 
          success: true, 
          message: "Acceso concedido", 
          user: { name: internalUser.name, username: internalUser.username, role: internalUser.role } 
        });
      } else {
        return res.status(401).json({ success: false, message: "Contraseña incorrecta." });
      }
    }

    const masterConfig = await Config.findOne({ key: "masterCredentials" });
    const master = masterConfig ? masterConfig.value : { username: "admin", password: "adminpassword" };

    if (username === master.username && password === master.password) {
      return res.json({ 
        success: true, 
        message: "Acceso concedido", 
        user: { name: "Administrador General", username, role: "Administrador" } 
      });
    }

    return res.status(401).json({ success: false, message: "El usuario ingresado no existe." });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Error interno en el servidor." });
  }
});

app.get("/api/exchange-rate", async (req, res) => {
  try {
    const currentRate = await getExchangeRate();
    res.json({ success: true, exchangeRate: currentRate });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener tipo de cambio" });
  }
});

app.post("/api/exchange-rate", async (req, res) => {
  try {
    const { rate } = req.body;
    if (!rate || isNaN(rate)) {
      return res.status(400).json({ success: false, message: "Tipo de cambio inválido" });
    }
    await Config.findOneAndUpdate(
      { key: "exchangeRate" },
      { value: parseFloat(rate) },
      { upsert: true }
    );
    res.json({ success: true, message: "Tipo de cambio actualizado" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al actualizar tipo de cambio" });
  }
});

app.get("/api/inventory", async (req, res) => {
  try {
    const inventory = await Product.find();
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener inventario" });
  }
});

app.post("/api/inventory", async (req, res) => {
  try {
    const { isExisting, existingKey, name, priceUSD, imei, color, almacenamiento, ram, pantalla, camara, bateria } = req.body;
    
    const duplicate = await Product.findOne({ imei: imei.trim() });
    if (duplicate) {
      return res.status(400).json({ success: false, message: "El IMEI introducido ya existe en el sistema." });
    }

    const lastProduct = await Product.findOne().sort({ id: -1 });
    const newId = lastProduct ? lastProduct.id + 1 : 1;
    
    const currentExchangeRate = await getExchangeRate();
    const usdVal = parseFloat(priceUSD);
    const computedPriceBOB = Math.round((usdVal * currentExchangeRate) * 100) / 100;

    let newProductData = {};

    if (isExisting) {
      const allProducts = await Product.find();
      const referenceItem = allProducts.find(item => 
        `${item.name}|${item.almacenamiento}|${item.ram}` === existingKey
      );

      if (!referenceItem) {
        return res.status(404).json({ success: false, message: "No se encontró el modelo base seleccionado." });
      }

      newProductData = {
        id: newId,
        name: referenceItem.name,
        price: computedPriceBOB, 
        priceUSD: usdVal,
        exchangeRate: currentExchangeRate,
        imei: imei.trim(),
        color: color.trim(),
        almacenamiento: referenceItem.almacenamiento,
        ram: referenceItem.ram,
        status: "Disponible",
        specs: { ...referenceItem.specs }
      };
    } else {
      newProductData = {
        id: newId,
        name: name.trim(),
        price: computedPriceBOB, 
        priceUSD: usdVal,
        exchangeRate: currentExchangeRate,
        imei: imei.trim(),
        color: color.trim(),
        almacenamiento: almacenamiento.trim(),
        ram: ram.trim(),
        status: "Disponible",
        specs: { pantalla: pantalla.trim(), camara: camara.trim(), bateria: bateria.trim() }
      };
    }

    const newProduct = new Product(newProductData);
    await newProduct.save();

    const newHistory = new History({
      datetime: new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz" }),
      operation: "Ingreso de Equipo",
      productName: `${newProduct.name} (${newProduct.color})`,
      quantity: `IMEI: ${newProduct.imei} ($${usdVal} USD a tc ${currentExchangeRate})`,
      responsible: "Administrador"
    });
    await newHistory.save();

    res.status(201).json({ success: true, message: "Stock incrementado correctamente.", product: newProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al agregar el modelo" });
  }
});

app.post("/api/sales", async (req, res) => {
  try {
    const { cartItems, seller } = req.body;

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "El carrito global está vacío." });
    }

    let itemsToSell = [];
    for (const cartItem of cartItems) {
      const specificUnit = await Product.findOne({ status: "Disponible", imei: cartItem.imeiElegido });
      if (!specificUnit) {
        return res.status(400).json({ 
          success: false, 
          message: `El equipo con IMEI: ${cartItem.imeiElegido || 'No especificado'} ya no se encuentra disponible.` 
        });
      }
      itemsToSell.push(specificUnit);
    }

    const currentDatetime = new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz" });
    const currentSaleDate = getLocalDateBO();
    const lastSale = await Sale.findOne().sort({ id: -1 });
    const newSaleId = lastSale ? lastSale.id + 1 : 1;
    const currentExchangeRate = await getExchangeRate();

    let totalSalePrice = 0;
    let itemsSoldSummary = [];

    for (const product of itemsToSell) {
      let usdValue = parseFloat(product.priceUSD);
      if (isNaN(usdValue) || usdValue <= 0) {
        let basePrice = parseFloat(product.price) || 0;
        let rate = parseFloat(product.exchangeRate) || currentExchangeRate;
        usdValue = basePrice / rate;
      }
      
      let actualCalculatedPrice = Math.floor((usdValue * currentExchangeRate) / 5) * 5;
      if (isNaN(actualCalculatedPrice) || actualCalculatedPrice <= 0) {
        actualCalculatedPrice = parseFloat(product.price) || 0;
      }
      
      await Product.findOneAndUpdate({ imei: product.imei }, { status: "Vendido", price: actualCalculatedPrice, exchangeRate: currentExchangeRate });
      totalSalePrice += actualCalculatedPrice;

      itemsSoldSummary.push({
        id: product.id,
        name: product.name,
        price: actualCalculatedPrice,
        imei: product.imei,
        color: product.color,
        almacenamiento: product.almacenamiento,
        ram: product.ram
      });

      const newHistory = new History({
        datetime: currentDatetime,
        operation: `Venta (Reg Nro: ${newSaleId})`,
        productName: `${product.name} [${product.color}]`,
        quantity: `IMEI: ${product.imei} (${product.almacenamiento}/${product.ram})`,
        responsible: seller || "Desconocido"
      });
      await newHistory.save();
    }

    const newSale = new Sale({
      id: newSaleId,
      datetime: currentDatetime,
      saleDate: currentSaleDate,
      seller: seller || "Desconocido",
      totalPrice: totalSalePrice,
      products: itemsSoldSummary
    });
    await newSale.save();

    res.json({ success: true, message: `Venta múltiple consolidada. Registro Nro: ${newSaleId}`, sale: newSale });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al procesar la venta." });
  }
});

app.get("/api/sales", async (req, res) => {
  try {
    const sales = await Sale.find();
    res.json(sales);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener registros de ventas" });
  }
});

app.get("/api/history", async (req, res) => {
  try {
    const history = await History.find();
    res.json(history);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener el historial" });
  }
});

// Convierte el datetime viejo en texto ("16/6/2026, 14:30:25") a "YYYY-MM-DD"
function parseLegacyDatetime(datetime) {
  if (!datetime || typeof datetime !== "string") return null;
  const fechaParte = datetime.split(",")[0].trim(); // "16/6/2026"
  const partes = fechaParte.split("/");
  if (partes.length !== 3) return null;
  const dia = partes[0].padStart(2, "0");
  const mes = partes[1].padStart(2, "0");
  const anio = partes[2];
  return `${anio}-${mes}-${dia}`;
}

// Asegura que toda venta tenga saleDate (migra las viejas la primera vez que se consultan)
async function backfillSaleDates() {
  const sinFecha = await Sale.find({ $or: [{ saleDate: { $exists: false } }, { saleDate: null }, { saleDate: "" }] });
  for (const sale of sinFecha) {
    const fecha = parseLegacyDatetime(sale.datetime);
    if (fecha) {
      sale.saleDate = fecha;
      await sale.save();
    }
  }
}

app.get("/api/dashboard-stats", async (req, res) => {
  try {
    await backfillSaleDates();

    const fechaFiltro = req.query.date || getLocalDateBO();

    const ventasDelDia = await Sale.find({ saleDate: fechaFiltro });
    const inventory = await Product.find({ status: "Disponible" });

    const totalSalesCount = ventasDelDia.reduce((acc, sale) => acc + sale.products.length, 0);
    const stockCount = inventory.length;
    const totalRevenue = ventasDelDia.reduce((acc, sale) => acc + sale.totalPrice, 0);

    res.json({
      sales: totalSalesCount,
      stock: stockCount,
      revenue: totalRevenue,
      date: fechaFiltro
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al calcular estadísticas" });
  }
});

app.get("/api/sales-dates", async (req, res) => {
  try {
    await backfillSaleDates();
    const sales = await Sale.find({}, "saleDate");
    const fechas = [...new Set(sales.map(s => s.saleDate).filter(Boolean))];
    res.json({ dates: fechas, today: getLocalDateBO() });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener fechas de ventas" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({ active: { $ne: false } });
    res.json(users);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener usuarios" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.active === false) {
      return res.status(404).json({ success: false, message: "El usuario no existe o ya fue desactivado." });
    }

    // Protección: no permitir desactivar al último administrador activo
    if (user.role === "Administrador") {
      const adminsActivos = await User.countDocuments({ role: "Administrador", active: { $ne: false } });
      if (adminsActivos <= 1) {
        return res.status(400).json({
          success: false,
          message: "No se puede eliminar al único administrador activo del sistema."
        });
      }
    }

    user.active = false;
    // Conservar los valores originales por trazabilidad, luego liberar correo y
    // username para que puedan reutilizarse en un registro nuevo.
    const sufijo = `__inactivo_${Date.now()}`;
    user.originalEmail = user.email;
    user.originalUsername = user.username;
    user.email = `${user.email}${sufijo}`;
    user.username = `${user.username}${sufijo}`;
    await user.save();

    res.json({ success: true, message: `Usuario ${user.name} desactivado correctamente.` });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al eliminar el usuario." });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;

    const duplicateEmail = await User.findOne({ email: email.toLowerCase(), active: { $ne: false } });
    if (duplicateEmail) {
      return res.status(400).json({ success: false, message: "Ese correo ya está registrado." });
    }

    const duplicateUser = await User.findOne({ username: username.toLowerCase().trim(), active: { $ne: false } });
    if (duplicateUser) {
      return res.status(400).json({ success: false, message: "El nombre de usuario ya está en uso." });
    }

    const newUser = new User({ 
      name: name.trim(), 
      username: username.toLowerCase().trim(), 
      email: email.trim(), 
      password: password.trim(), 
      role 
    });
    await newUser.save();

    res.status(201).json({ success: true, message: `Usuario ${name} registrado correctamente.`, user: newUser });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al registrar usuario en el servidor." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});