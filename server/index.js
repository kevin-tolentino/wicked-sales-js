require('dotenv/config');
const express = require('express');

const db = require('./database');
const ClientError = require('./client-error');
const staticMiddleware = require('./static-middleware');
const sessionMiddleware = require('./session-middleware');

const app = express();

app.use(staticMiddleware);
app.use(sessionMiddleware);

app.use(express.json());

app.get('/api/health-check', (req, res, next) => {
  db.query('select \'successfully connected\' as "message"')
    .then(result => res.json(result.rows[0]))
    .catch(err => next(err));
});

app.get('/api/products', (req, res, next) => {
  const sql = `
select
"productId",
"name",
"price",
"image",
"shortDescription"
from
  "products"
order by
  "productId";
  `;
  db.query(sql)
    .then(result => {
      res.json(result.rows);
    })
    .catch(err => next(err));
});

app.get('/api/products/:productId', (req, res, next) => {
  let productId = parseInt(req.params.productId);
  productId = [productId];
  const sql = `
  select
  *
  from
  "products"
  where "productId" = $1;
  `;

  db.query(sql, productId)
    .then(result => {
      if (result.rows.length === 0) {
        return next(new ClientError(`Product Id: ${productId} cannot be found`, 404));
      }
      const product = result.rows[0];
      res.json(product);
    })
    .catch(err => next(err));
}
);

app.get('/api/cart', (req, res, next) => {
  const sql = `
select
"cartId",
"createdAt"
from
  "carts"
order by
  "cartId"
  `;
  db.query(sql)
    .then(result => {
      res.json(result.rows);
    })
    .catch(err => next(err));
});

app.post('/api/cart', (req, res, next) => {
  // const keyNames = Object.keys(req.body);
  if (isNaN(req.body.productId)) {
    return res.status(400).json({ error: `Invalid field used for this POST method for ProductId '${req.body.productId}'. Try using a number type value.` });
  }
  if (req.body.productId < 0) {
    return res.status(400).json({ error: `Invalid field used for this POST method for ProductId '${req.body.productId}'. Please use an Id greater than 0.` });
  }
  const sql = `
  select
  "price"
  from
    "products"
  where "productId" = $1
  `;
  const values = [req.body.productId];
  db.query(sql, values)
    .then(result => {
      if (result.rows.length === 0) {
        throw new ClientError(`Product Id: ${req.body.productId} cannot be found`, 400);
      }
      const price = result.rows[0];
      const sqlInsert = `
      insert into "carts" ("cartId", "createdAt")
      values (default, default)
      returning "cartId";`;
      return db.query(sqlInsert)
        .then(result => {
          const returnObj = Object.assign(price, result.rows[0]);
          return returnObj;
        })
        .catch(err => next(err));
    })
    .then(result => {
      const returnedCartId = result.cartId;
      req.session.cartId = returnedCartId;
    })
  // .then(result => {})
  // .then(result => { })
    .catch(err => next(err.message));
});

app.use('/api', (req, res, next) => {
  next(new ClientError(`cannot ${req.method} ${req.originalUrl}`, 404));
});

app.use((err, req, res, next) => {
  if (err instanceof ClientError) {
    res.status(err.status).json({ error: err.message });
  } else {
    console.error(err);
    res.status(500).json({
      error: 'an unexpected error occurred'
    });
  }
});

app.listen(process.env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log('Listening on port', process.env.PORT);
});
