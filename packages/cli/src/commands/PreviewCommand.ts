import yaml, { dump } from "js-yaml";
import { readFile } from 'fs/promises';
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";

/*TODO : Add template html of the appstore page - done
 * Add template tags in html - done
 * Icon and banner - done
 * screenshots, demo and feature image - done
 * Run webserver and serve the html
 * Auto open the preview
 */

interface Media {
  purpose: string;
  uri: string;
}

interface FileEntry {
  purpose: string;
  uri: string;
}

interface CatalogEntry {
  name: string;
  short_description: string;
  long_description: string;
  new_in_version: string;
  saga_features: string;
}

interface AlphaTester {
  address: string;
  comment?: string;
}

interface Config {
  publisher: {
    name: string;
    address: string;
    website: string;
    email: string;
    media: Media[];
  };
  app: {
    name: string;
    address: string;
    android_package: string;
    urls: {
      license_url: string;
      copyright_url: string;
      privacy_policy_url: string;
      website: string;
    };
    media: Media[];
  };
  release: {
    address: string;
    media: Media[];
    files: FileEntry[];
    catalog: {
      'en-US': CatalogEntry;
    };
  };
  solana_mobile_dapp_publisher_portal: {
    google_store_package: string;
    testing_instructions: string;
    alpha_testers: AlphaTester[];
  };
}

function readData() {
  try {
  const doc = yaml.load(fs.readFileSync("config.yaml", "utf-8"));
  return doc;
  } catch(err) {
  console.error("Error loading config file.")
  return null;
  }
}

function fillTemplate(template: string, data: Record<string, string>): string {
  let result = new JSDOM(template);
  //For screenshots/demo images
  const purposesList = [ "screenshot", "video" ]
  result.window.document.getElementById("app-title").textContent = data.app.name;
  result.window.document.getElementById("app-developer").textContent = data.publisher.name;
  result.window.document.getElementById("description").textContent = data.release.catalog["en-US"].short_description;
  result.window.document.getElementById("app-icon").innerHTML = `<img src=${data.app.media[0].uri} >`;
  result.window.document.getElementById("banner").innerHTML = `<img src=${data.release.media.find(m => m.purpose === "banner").uri} >`;
  const screenshots = purposesList.map(purpose => {
        const mediaItems = data.release.media.filter(m => m.purpose === purpose);
        if (mediaItems.length === 0) return null;

        return mediaItems.map((item, index) => (`
          <div class="screenshot">
            <img src=${item.uri} />
          </div>`)
        );
      });
  result.window.document.getElementById("screenshots").innerHTML = screenshots.join("");
  return result.serialize();
}

export function previewCommand(): string {
  const templatePath = path.resolve("node_modules/@solana-mobile/dapp-store-cli/src/commands/app-preview.html");
  const template = fs.readFileSync(templatePath, "utf-8");
  const configData = readData(); 
  if (configData !== null) {
    const filled = fillTemplate(template, configData);
    const outputFileName = "app-preview.html";
    console.log(`✅ HTML generated: ${outputFileName}`);
    fs.writeFileSync(outputFileName, filled, "utf-8");
    return outputFileName;
  } else {
    return null;
  }
}
