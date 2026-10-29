import 'package:flutter/material.dart';
class ProductListScreen extends StatelessWidget {
  const ProductListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final products = [
      {"id": 1, "name": "Áo thun", "price": 120000.5, "inStock": true, "tags": ["thời trang", "nam"], "category": {"id": 2, "title": "Quần áo"}},
      {"id": 2, "name": "Giày", "price": 450000, "inStock": false, "tags": [], "category": null}
    ];

    return Scaffold(
      appBar: AppBar(title: const Text("Danh sách sản phẩm")),
      body: ListView.builder(
        itemCount: products.length,
        itemBuilder: (context, index) {
          final product = products[index];
          return ListTile(
            leading: Icon(Icons.shopping_cart),
            title: Text(product.name),
            subtitle: Text("Giá: ${product.price.toStringAsFixed(0)}đ"),
            trailing: IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: () {
                Navigator.pushNamed(context, '/product_detail', arguments: product);
              }
            ),
          );
        },
      ),
    );
  }
}