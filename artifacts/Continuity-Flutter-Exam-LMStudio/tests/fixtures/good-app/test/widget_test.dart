import 'package:flutter_test/flutter_test.dart';
import 'package:product_app/main.dart';

void main() {
  testWidgets('app starts', (tester) async {
    await tester.pumpWidget(const MyApp());
  });
}
