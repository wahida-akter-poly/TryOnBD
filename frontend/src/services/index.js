import { userService } from './userService';
import { sellerService } from './sellerService';
import { productService } from './productService';
import { categoryService } from './categoryService';
import { tryOnService } from './tryOnService';
import { reviewService } from './reviewService';
import { orderService } from './orderService';
export const services = {
  users: userService,
  sellers: sellerService,
  products: productService,
  categories: categoryService,
  sessions: tryOnService,
  reviews: reviewService,
  orders: orderService,
};
