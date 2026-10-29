import 'package:flutter/material.dart';
import 'package:product_app/models/product.dart';
import 'package:product_app/screens/add_product_screen.dart';

class ProductDetailScreen extends StatelessWidget {
  const ProductDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final product = ModalRoute.of(context)?.settings.arguments as Product?;

    if (product == null) {
      return Scaffold(
        appBar: AppBar(title: Text('Sản phẩm chưa được chọn')),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(product.name)),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Hiển thị thông tin sản phẩm
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(product.name, style: const TextStyle(fontSize: 20)),
                    SizedBox(height: 16),
                    Text('Giá: ${product.price.toStringAsFixed(0)} đ'),
                    Text('Tình trạng: ${product.inStock ? "Có sẵn" : "Đã hết hàng"}'),
                  ],
                ),
              ),
            ),

            // Hiển thị danh mục nếu có
            if (product.category != null) ...[
              SizedBox(height: 16),
              Text('Danh mục: ${product.category.title}'),
            ],

            // Nút quay lại
            Padding(
              padding: const EdgeInsets.all(24.0),
              child: ElevatedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                },
                icon: Icon(Icons.arrow_back_ios_new),
                label: Text('Quay lại'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}