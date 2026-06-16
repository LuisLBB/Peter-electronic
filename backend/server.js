import express from "express";
import cors from "cors";
import mongoose from "mongoose";

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://luislebo97_db_user:tengentopa678a9A2@cluster30.ha8qkxv.mongodb.net/?appName=Cluster30";

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
  role: { type: String, required: true }
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

app.use(cors());
app.use(express.json());

async function getExchangeRate() {
  const rateConfig = await Config.findOne({ key: "exchangeRate" });
  return rateConfig ? parseFloat(rateConfig.value) : 6.96;
}

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const internalUser = await User.findOne({ username: username.toLowerCase().trim() });
    if (internalUser) {
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

app.get("/api/dashboard-stats", async (req, res) => {
  try {
    const salesHistory = await Sale.find();
    const inventory = await Product.find({ status: "Disponible" });

    const totalSalesCount = salesHistory.reduce((acc, sale) => acc + sale.products.length, 0);
    const stockCount = inventory.length;
    const totalRevenue = salesHistory.reduce((acc, sale) => acc + sale.totalPrice, 0);

    res.json({ sales: totalSalesCount, stock: stockCount, revenue: totalRevenue });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al calcular estadísticas" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener usuarios" });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;

    const duplicateEmail = await User.findOne({ email: email.toLowerCase() });
    if (duplicateEmail) {
      return res.status(400).json({ success: false, message: "Ese correo ya está registrado." });
    }

    const duplicateUser = await User.findOne({ username: username.toLowerCase().trim() });
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