import 'package:flutter/material.dart';
import 'package:product_app/models/product.dart';

class ProductDetailScreen extends StatelessWidget {
  final Product product;

  const ProductDetailScreen({Key? key, required this.product}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Chi tiết sản phẩm')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(product.name),
            const SizedBox(height: 16),
            Text('Giá: ${product.price.toStringAsFixed(0)} đ'),
            const SizedBox(height: 24),
            if (product.inStock)
              Text('Đã sẵn sàng mua!')
            else
              Text('Sản phẩm đang hết hàng'),
          ],
        ),
      ),
    );
  }
}