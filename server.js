var express = require("express");
var multer = require("multer");
var csv = require("fast-csv");
var fs = require("fs");
var app = express();
var path = require("path");
const Excel = require("exceljs");

global.__basedir = __dirname;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, `${__basedir}/uploads/`);
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}-${Date.now()}-${file.originalname}`);
  },
});

const csvFilter = (req, file, cb) => {
  if (file.mimetype.includes("csv")) {
    cb(null, true);
  } else {
    cb("Please upload only csv file", false);
  }
};

const getOrders = (data) =>
  data.filter(
    (order) =>
      order.Type === "order" &&
      order.PaymentStatus !== "IN_PROGRESS" &&
      order.SellerStatus !== "CANCELLED"
  );

const getLineItems = (data) =>
  data
    .filter((item) => item.Type === "lineItem")
    .map((item) => ({
      Type: item.Type,
      OrderId: item.OrderId,
      LineItemId: item.SellerId,
      OfferId: item.SellerLogin,
      Name: item.SellerStatus,
      Quantity: item.BuyerId,
      Price: item.BuyerLogin,
      Currency: item.BuyerEmail,
    }));

const getExcelData = (orders, lineItems) =>
  orders
    .map((order) => ({
      date: order.OrderDate,
      name: order.BuyerName,
      company: order.InvoiceCompanyName,
      tax: 0.23,
      productName: lineItems
        .filter((item) => item.OrderId === order.OrderId)
        .map((found) => found.Name)
        .join(" ,"),
      price: order.TotalToPayAmount,
    }))
    .filter((elem) => elem.price > 0);

const createExcelWorkbook = (data) => {
  const workBook = new Excel.Workbook();
  const workSheet = workBook.addWorksheet("Ewidencja");

  workSheet.columns = [
    { header: "L.p.", key: "lp" },
    { header: "Data", key: "date", width: 12 },
    { header: "Imię i nazwisko", key: "name", width: 20 },
    { header: "Firma", key: "company", width: 20 },
    { header: "Podatek", key: "tax" },
    { header: "Nazwa", key: "productName", width: 50 },
    { header: "Koszt całkowity", key: "price", width: 15 },
  ];

  workSheet.autoFilter = "A1:G1";

  data.forEach((data, idx) => {
    workSheet.addRow({
      ...data,
      lp: idx + 1,
      date: data.date.match(/\d{4}-\d+-\d+/)[0],
      price: Number(data.price),
    });
  });

  workSheet.addRow({
    price: {
      formula: `=SUM(G2:G${data.length + 1})`,
    },
  });
  workSheet.getColumn(5).numFmt = "0%";
  workSheet.getColumn(7).numFmt = "0.00";

  return workBook;
};

const upload = multer({ storage, fileFilter: csvFilter });

app.use(express.static(`${__basedir}/excel/`));

app.get("/", function (req, res) {
  res.sendFile(path.join(`${__dirname}/index.html`));
});

app.post("/api/upload", upload.single("csv"), function (req, res) {
  try {
    const filePath = `${__basedir}/uploads/${req.file.filename}`;
    let buyData = [];

    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true }))
      .on("data", (row) => {
        buyData.push(row);
      })
      .on("end", () => {
        const orders = getOrders(buyData);
        const lineItems = getLineItems(buyData);
        const dataToExcel = getExcelData(orders, lineItems);
        const workBook = createExcelWorkbook(dataToExcel);
        const fileName = `Ewidencja-${Date.now()}.xlsx`;
        const excelFilePath = `${__basedir}/excel/${fileName}`;

        fs.unlinkSync(filePath);

        workBook.xlsx.writeFile(excelFilePath).then(() => {
          res
            .status(200)
            .send({ message: "Plik excel wygenerowany", fileName });
        });
      });
  } catch (error) {
    throw error;
  }
});

app.listen(3000);

console.log("Running at Port 3000");
