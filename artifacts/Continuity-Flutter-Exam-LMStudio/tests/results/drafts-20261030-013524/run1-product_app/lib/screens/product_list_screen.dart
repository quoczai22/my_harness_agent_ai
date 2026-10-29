import 'package:flutter/material.dart';
import 'package:product_app/models/product.dart';
import 'package:product_app/screens/add_product_screen.dart';
import 'package:product_app/screens/product_detail_screen.dart';

class ProductListScreen extends StatelessWidget {
  const ProductListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final products = [
      Product(id: 1, name: "Áo thun", price: 120000.5, inStock: true, tags: ["thời trang", "nam"], category: Category(id: 2, title: "Quần áo")),
      Product(id: 2, name: "Giày", price: 450000, inStock: false, tags: [], category: null),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text("Danh sách sản phẩm")),
      body: ListView.builder(
        itemCount: products.length,
        itemBuilder: (context, index) {
          final product = products[index];
          return ListTile(
            leading: Icon(Icons.shopping_bag),
            title: Text(product.name),
            subtitle: Text("Giá: ${product.price.toStringAsFixed(0)} đ"),
            trailing: IconButton(
              icon: const Icon(Icons.chevron_right),
              onPressed: () {
                Navigator.pushNamed(context, '/product_detail', arguments: product);
              },
            ),
          );
        },
      ),
    );
  }
}