import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "data", "database.json");

const app = express();
const PORT = 5000;

let currentExchangeRate = 6.96;

app.use(cors());
app.use(express.json());

async function readDB() {
  const data = await fs.readFile(dbPath, "utf-8");
  return JSON.parse(data);
}

async function writeDB(data) {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), "utf-8");
}

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = await readDB();

    if (!db.registeredUsers) db.registeredUsers = [];

    const internalUser = db.registeredUsers.find(
      user => user.username && user.username.toLowerCase() === username.toLowerCase().trim()
    );

    if (internalUser) {
      if (internalUser.password === password.trim()) {
        return res.json({ 
          success: true, 
          message: "Acceso concedido", 
          user: { 
            name: internalUser.name, 
            username: internalUser.username, 
            role: internalUser.role 
          } 
        });
      } else {
        return res.status(401).json({ success: false, message: "Contraseña incorrecta." });
      }
    }

    if (username === db.credentials.username && password === db.credentials.password) {
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

app.get("/api/exchange-rate", (req, res) => {
  try {
    res.json({ success: true, exchangeRate: currentExchangeRate });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener tipo de cambio" });
  }
});

app.post("/api/exchange-rate", (req, res) => {
  try {
    const { rate } = req.body;
    if (!rate || isNaN(rate)) {
      return res.status(400).json({ success: false, message: "Tipo de cambio inválido" });
    }
    currentExchangeRate = parseFloat(rate);
    res.json({ success: true, message: "Tipo de cambio actualizado" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al actualizar tipo de cambio" });
  }
});

app.get("/api/inventory", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.inventory || []);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener inventario" });
  }
});

app.post("/api/inventory", async (req, res) => {
  try {
    const { isExisting, existingKey, name, priceUSD, imei, color, almacenamiento, ram, pantalla, camara, bateria } = req.body;
    const db = await readDB();

    if (!db.inventory) db.inventory = [];

    const duplicate = db.inventory.some(item => item.imei === imei.trim());
    if (duplicate) {
      return res.status(400).json({ success: false, message: "El IMEI introducido ya existe en el sistema." });
    }

    const newId = db.inventory.length > 0 ? Math.max(...db.inventory.map(i => i.id)) + 1 : 1;
    let newProduct = {};

    const usdVal = parseFloat(priceUSD);
    const computedPriceBOB = Math.round((usdVal * currentExchangeRate) * 100) / 100;

    if (isExisting) {
      const referenceItem = db.inventory.find(item => 
        `${item.name}|${item.almacenamiento}|${item.ram}` === existingKey
      );

      if (!referenceItem) {
        return res.status(404).json({ success: false, message: "No se encontró el modelo base seleccionado." });
      }

      newProduct = {
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
      newProduct = {
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

    db.inventory.push(newProduct);

    if (!db.history) db.history = [];
    db.history.push({
      datetime: new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz" }),
      operation: "Ingreso de Equipo",
      productName: `${newProduct.name} (${newProduct.color})`,
      quantity: `IMEI: ${newProduct.imei} ($${usdVal} USD a tc ${currentExchangeRate})`,
      responsible: "Administrador General"
    });

    await writeDB(db);
    res.status(201).json({ success: true, message: "Stock incrementado correctamente.", product: newProduct });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al agregar el modelo" });
  }
});

app.post("/api/sales", async (req, res) => {
  try {
    const { cartItems, seller } = req.body;
    const db = await readDB();

    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "El carrito global está vacío." });
    }

    let itemsToSell = [];
    
    for (const cartItem of cartItems) {
      // Buscamos directamente el terminal por su IMEI específico que venga desde el cliente
      const specificUnit = db.inventory.find(item => 
        item.status === "Disponible" && 
        item.imei === cartItem.imeiElegido
      );

      if (!specificUnit) {
        return res.status(400).json({ 
          success: false, 
          message: `El equipo con IMEI: ${cartItem.imeiElegido || 'No especificado'} ya no se encuentra disponible.` 
        });
      }

      itemsToSell.push(specificUnit);
    }

    const currentDatetime = new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz" });
    if (!db.salesHistory) db.salesHistory = [];
    const newSaleId = db.salesHistory.length > 0 ? Math.max(...db.salesHistory.map(s => s.id)) + 1 : 1;

    let totalSalePrice = 0;
    const itemsSoldSummary = itemsToSell.map(product => {
      product.status = "Vendido";
      
      const usdValue = product.priceUSD || (product.price / (product.exchangeRate || currentExchangeRate));
      const actualCalculatedPrice = Math.floor((usdValue * currentExchangeRate) / 5) * 5;
      product.price = actualCalculatedPrice;
      product.exchangeRate = currentExchangeRate;
      
      totalSalePrice += actualCalculatedPrice;

      return {
        id: product.id,
        name: product.name,
        price: actualCalculatedPrice,
        imei: product.imei,
        color: product.color,
        almacenamiento: product.almacenamiento,
        ram: product.ram
      };
    });

    const newSale = {
      id: newSaleId,
      datetime: currentDatetime,
      seller: seller || "Desconocido",
      totalPrice: totalSalePrice,
      products: itemsSoldSummary
    };
    db.salesHistory.push(newSale);

    if (!db.history) db.history = [];
    itemsSoldSummary.forEach(item => {
      db.history.push({
        datetime: new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz" }),
        operation: "Ingreso de Equipo",
        productName: `${newProduct.name} (${newProduct.color})`,
        quantity: `IMEI: ${newProduct.imei} ($${usdVal} USD a tc ${currentExchangeRate})`,
        responsible: "Administrador"
      });
    });

    await writeDB(db);
    res.json({ success: true, message: `Venta múltiple consolidada. Registro Nro: ${newSaleId}`, sale: newSale });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al procesar la venta." });
  }
});

app.get("/api/sales", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.salesHistory || []);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener registros de ventas" });
  }
});

app.get("/api/history", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.history || []);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener el historial" });
  }
});

app.get("/api/dashboard-stats", async (req, res) => {
  try {
    const db = await readDB();
    const totalSalesCount = db.salesHistory ? db.salesHistory.reduce((acc, sale) => acc + sale.products.length, 0) : 0;
    const stockCount = db.inventory ? db.inventory.filter(item => item.status === "Disponible").length : 0;
    const totalRevenue = db.salesHistory ? db.salesHistory.reduce((acc, sale) => acc + sale.totalPrice, 0) : 0;

    res.json({ sales: totalSalesCount, stock: stockCount, revenue: totalRevenue });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al calcular estadísticas" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.registeredUsers || []);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener usuarios" });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;
    const db = await readDB();

    if (!db.registeredUsers) db.registeredUsers = [];

    const duplicateEmail = db.registeredUsers.some(user => user.email.toLowerCase() === email.toLowerCase());
    if (duplicateEmail) {
      return res.status(400).json({ success: false, message: "Ese correo ya está registrado." });
    }

    const duplicateUser = db.registeredUsers.some(
      user => user.username && user.username.toLowerCase() === username.toLowerCase().trim()
    );
    if (duplicateUser) {
      return res.status(400).json({ success: false, message: "El nombre de usuario ya está en uso." });
    }

    const newUser = { 
      name: name.trim(), 
      username: username.toLowerCase().trim(), 
      email: email.trim(), 
      password: password.trim(), 
      role 
    };
    
    db.registeredUsers.push(newUser);
    await writeDB(db);

    res.status(201).json({ success: true, message: `Usuario ${name} registrado correctamente.`, user: newUser });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al registrar usuario en el servidor." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://192.168.1.103:${PORT}`);
});