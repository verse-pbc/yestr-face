# Integrating Yestr Face with Yestr App

This guide shows how to update your Yestr app to use the Yestr Face proxy service for profile pictures.

## Configuration

### 1. Update Environment Configuration

Add the proxy URL to your app's configuration:

```dart
// lib/config/app_config.dart
class AppConfig {
  static const String avatarProxyUrl = 'https://yestr-face.your-subdomain.workers.dev';
  // or with custom domain:
  // static const String avatarProxyUrl = 'https://avatars.yestr.app';
}
```

### 2. Create Avatar URL Helper

Create a helper function to generate proxy URLs:

```dart
// lib/utils/avatar_helper.dart
class AvatarHelper {
  static String getProxyUrl(String? originalUrl, String pubkey, {int size = 400}) {
    // If no original URL, return proxy URL anyway (might be cached)
    if (originalUrl == null || originalUrl.isEmpty) {
      return '${AppConfig.avatarProxyUrl}/avatar/$pubkey?size=$size';
    }

    // Use proxy for all profile pictures
    return '${AppConfig.avatarProxyUrl}/avatar/$pubkey?size=$size';
  }

  static String getThumbnail(String pubkey) {
    return getProxyUrl(null, pubkey, size: 200);
  }

  static String getMedium(String pubkey) {
    return getProxyUrl(null, pubkey, size: 400);
  }

  static String getLarge(String pubkey) {
    return getProxyUrl(null, pubkey, size: 800);
  }
}
```

### 3. Update Profile Card Widget

Update your profile card to use the proxy:

```dart
// lib/widgets/profile_card.dart
import 'package:cached_network_image/cached_network_image.dart';
import '../utils/avatar_helper.dart';

class ProfileCard extends StatelessWidget {
  final NostrProfile profile;

  @override
  Widget build(BuildContext context) {
    return CachedNetworkImage(
      imageUrl: AvatarHelper.getMedium(profile.pubkey),
      fit: BoxFit.cover,
      placeholder: (context, url) => Container(
        color: Colors.grey[300],
        child: const Center(
          child: CircularProgressIndicator(),
        ),
      ),
      errorWidget: (context, url, error) {
        // Fallback to placeholder
        return Container(
          color: Colors.grey[300],
          child: const Icon(
            Icons.person,
            size: 100,
            color: Colors.grey,
          ),
        );
      },
    );
  }
}
```

### 4. Update Profile Screen

For the profile detail screen, use larger images:

```dart
// lib/screens/profile/profile_screen.dart
CachedNetworkImage(
  imageUrl: AvatarHelper.getLarge(profile.pubkey),
  fit: BoxFit.cover,
  // ... rest of configuration
)
```

### 5. Preload Images (Optional)

For better performance, preload images when fetching profiles:

```dart
// lib/services/profile_service.dart
Future<void> preloadProfileImages(List<NostrProfile> profiles) async {
  final futures = profiles.map((profile) {
    return precacheImage(
      CachedNetworkImageProvider(
        AvatarHelper.getThumbnail(profile.pubkey),
      ),
      context,
    );
  });

  await Future.wait(futures);
}
```

## Benefits

1. **No CORS Issues**: All images are served with proper CORS headers
2. **Better Performance**: Images are cached at the edge
3. **Optimized Sizes**: Request specific sizes to reduce bandwidth
4. **Fallback Support**: Even if original image fails, proxy might have cached version
5. **Future Enhancements**: WebP support, image optimization, etc.

## Migration Strategy

### Phase 1: Gradual Rollout

1. Update the app to use proxy URLs
2. Keep original URLs as fallback
3. Monitor performance and errors

### Phase 2: Full Migration

1. Remove all CORS workarounds
2. Use proxy for all profile pictures
3. Remove fallback logic

### Example Migration Code

```dart
class ProfileImageWidget extends StatelessWidget {
  final String pubkey;
  final String? originalUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    // Phase 1: Try proxy first, fallback to original
    return CachedNetworkImage(
      imageUrl: AvatarHelper.getProxyUrl(originalUrl, pubkey, size: size.toInt()),
      errorWidget: (context, url, error) {
        // If proxy fails and we have original URL, try it
        if (originalUrl != null && !url.contains(AppConfig.avatarProxyUrl)) {
          return CachedNetworkImage(
            imageUrl: originalUrl!,
            errorWidget: (context, url, error) => _buildPlaceholder(),
          );
        }
        return _buildPlaceholder();
      },
    );
  }

  Widget _buildPlaceholder() {
    return Container(
      width: size,
      height: size,
      color: Colors.grey[300],
      child: Icon(Icons.person, size: size * 0.6),
    );
  }
}
```

## Monitoring

Track these metrics after integration:

- Image load success rate
- Average load time
- Cache hit rate
- User engagement with profiles

## Troubleshooting

### Images Not Loading

1. Check if proxy service is healthy: `https://your-proxy/health`
2. Verify pubkey format (64 character hex)
3. Check browser console for errors

### Slow Loading

1. Images are being fetched from original source (first load)
2. Use smaller sizes for lists (200px)
3. Implement progressive loading

### CORS Errors Still Appearing

1. Ensure you're using proxy URLs everywhere
2. Check that proxy URL is correct
3. Verify ALLOWED_ORIGINS is configured
